import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useFeedbackDialog } from './useFeedbackDialog';
import { openPaymentCheckout } from '../payments';
import type { BundleLegBreakdown } from '../types';

interface TripBundleScreenProps {
  onBack: () => void;
  onOpenTracking: (bundleId: string) => void;
}

interface SelectedMerchantItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface MerchantLegDraft {
  type: 'food' | 'grocery';
  merchantId: string;
  merchantName: string;
  address: string;
  items: SelectedMerchantItem[];
}

interface BundleQuoteResponse {
  quoteId: string;
  totalCents: number;
  currency: string;
  breakdown: BundleLegBreakdown[];
  codEligible: boolean;
  expiresAt: string;
}

export const TripBundleScreen: React.FC<TripBundleScreenProps> = ({ onBack, onOpenTracking }) => {
  const { alert, confirm, dialog } = useFeedbackDialog();

  // Steps: 'builder' | 'quote' | 'paying'
  const [step, setStep] = useState<'builder' | 'quote' | 'paying'>('builder');

  // Ride state
  const [includeRide, setIncludeRide] = useState(true);
  const [vehicleType, setVehicleType] = useState<'bike' | 'auto' | 'car'>('auto');
  const [ridePickup, setRidePickup] = useState('Anna Nagar, Chennai');
  const [rideDrop, setRideDrop] = useState('T. Nagar, Chennai');

  // Merchant stops state
  const [merchantDrafts, setMerchantDrafts] = useState<MerchantLegDraft[]>([
    {
      type: 'food',
      merchantId: 'rest_saravana_bhavan',
      merchantName: 'Saravana Bhavan',
      address: 'Poonamallee High Rd, Kilpauk',
      items: [
        { id: 'item_ghee_roast', name: 'Ghee Roast Dosa', price: 140, quantity: 1 },
        { id: 'item_filter_coffee', name: 'Filter Coffee', price: 45, quantity: 2 },
      ],
    },
  ]);

  // Catalog search / add stop modal state
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [selectedServiceToAdd, setSelectedServiceToAdd] = useState<'food' | 'grocery'>('grocery');
  const [newStoreName, setNewStoreName] = useState('Nilgiris Supermarket');
  const [newStoreAddress, setNewStoreAddress] = useState('Nungambakkam High Road');
  const [newItemName, setNewItemName] = useState('Fresh Organic Milk (1L)');
  const [newItemPrice, setNewItemPrice] = useState(48);

  // Quote state
  const [quote, setQuote] = useState<BundleQuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'wallet' | 'cash'>('upi');
  const [couponCode, setCouponCode] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Add a merchant stop
  const handleAddMerchantStop = () => {
    if (!newStoreName.trim() || !newItemName.trim() || newItemPrice <= 0) {
      alert('Please enter valid store and item details.');
      return;
    }
    const newDraft: MerchantLegDraft = {
      type: selectedServiceToAdd,
      merchantId: `merchant_${Date.now()}`,
      merchantName: newStoreName.trim(),
      address: newStoreAddress.trim() || 'Central Chennai',
      items: [
        {
          id: `item_${Date.now()}`,
          name: newItemName.trim(),
          price: newItemPrice,
          quantity: 1,
        },
      ],
    };
    setMerchantDrafts(prev => [...prev, newDraft]);
    setShowAddStopModal(false);
  };

  const handleRemoveMerchantStop = (index: number) => {
    setMerchantDrafts(prev => prev.filter((_, i) => i !== index));
  };

  // Request bundle quote
  const handleReviewBundle = async () => {
    const legsPayload: any[] = [];

    if (includeRide) {
      if (!ridePickup.trim() || !rideDrop.trim()) {
        alert('Please specify both ride pickup and destination.');
        return;
      }
      legsPayload.push({
        type: 'ride',
        pickupAddress: ridePickup,
        dropAddress: rideDrop,
        details: {
          vehicleType,
          pickupPlaceId: 'place_chennai_origin',
          dropPlaceId: 'place_chennai_dest',
        },
      });
    }

    for (const m of merchantDrafts) {
      if (m.items.length === 0) continue;
      legsPayload.push({
        type: m.type,
        pickupAddress: m.address,
        dropAddress: includeRide ? rideDrop : m.address,
        details: {
          ...(m.type === 'food' ? { restaurantId: m.merchantId } : { storeId: m.merchantId }),
          items: m.items.map(it => ({
            id: it.id,
            name: it.name,
            price: it.price,
            quantity: it.quantity,
          })),
        },
      });
    }

    if (legsPayload.length === 0) {
      alert('Please add at least one ride or merchant stop to your bundle.');
      return;
    }

    setLoadingQuote(true);
    try {
      const getQuoteCallable = httpsCallable<{ legs: any[]; couponCode?: string }, BundleQuoteResponse>(
        functions,
        'getBundleQuote'
      );
      const res = await getQuoteCallable({
        legs: legsPayload,
        couponCode: couponCode.trim() || undefined,
      });
      setQuote(res.data);
      setStep('quote');
    } catch (err: any) {
      alert(`Quote calculation failed: ${err.message || 'Server error'}`);
    } finally {
      setLoadingQuote(false);
    }
  };

  // Checkout with Razorpay or COD
  const handleProceedToPayment = async () => {
    if (!quote) return;
    setIsProcessingPayment(true);

    try {
      const createOrderCallable = httpsCallable<{ quoteId: string; paymentMethod: string }, any>(
        functions,
        'createBundlePaymentOrder'
      );
      const orderRes = await createOrderCallable({
        quoteId: quote.quoteId,
        paymentMethod,
      });
      const orderData = orderRes.data;

      let paymentId = 'COD';
      let signature = '';

      if (paymentMethod !== 'cash') {
        const receipt = await openPaymentCheckout({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'AllGo Unified Trip Bundle',
          description: `Bundle checkout for ${quote.breakdown.length} stops`,
          order_id: orderData.orderId,
          prefill: {
            name: 'Valued Customer',
            email: 'customer@allgo.in',
            contact: '9876543210',
          },
          theme: { color: '#4F46E5' },
        });

        paymentId = receipt.razorpay_payment_id;
        signature = receipt.razorpay_signature;
      }

      // Confirm checkout atomically
      const confirmCallable = httpsCallable<{ orderId: string; paymentId?: string; signature?: string }, { bundleId: string; status: string }>(
        functions,
        'confirmBundleCheckout'
      );
      const confirmRes = await confirmCallable({
        orderId: orderData.orderId,
        paymentId,
        signature,
      });

      alert(`Your trip bundle is booked successfully! Bundle ID: ${confirmRes.data.bundleId}`);
      onOpenTracking(confirmRes.data.bundleId);
    } catch (err: any) {
      alert(`Checkout failed: ${err.message || 'Payment interrupted'}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={step === 'quote' ? () => setStep('builder') : onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            aria-label="Back"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
              One Unified Trip Bundle
            </h1>
            <p className="text-xs text-slate-400">Combine Ride + Food + Groceries in one booking</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          AllGo Mingled
        </span>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-6">
        {step === 'builder' && (
          <>
            {/* Ride Card */}
            <section className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-lg">
                    🚗
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">Primary Ride (Route Backbone)</h2>
                    <p className="text-xs text-slate-400">Your travel journey across town</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeRide}
                    onChange={e => setIncludeRide(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  Include Ride
                </label>
              </div>

              {includeRide && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs text-slate-400 font-medium">Pickup Location</label>
                    <input
                      type="text"
                      value={ridePickup}
                      onChange={e => setRidePickup(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-slate-900/80 border border-slate-700 px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      placeholder="Enter pickup address"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium">Final Destination</label>
                    <input
                      type="text"
                      value={rideDrop}
                      onChange={e => setRideDrop(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-slate-900/80 border border-slate-700 px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      placeholder="Enter drop location"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium">Vehicle Option</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {(['bike', 'auto', 'car'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setVehicleType(type)}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold uppercase tracking-wider border transition ${
                            vehicleType === type
                              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                              : 'bg-slate-900/60 text-slate-400 border-slate-700/80 hover:bg-slate-800'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Merchant Stops Along the Route */}
            <section className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg">
                    🛍️
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">En-Route Stops & Orders</h2>
                    <p className="text-xs text-slate-400">Food, groceries, or essentials collected on your trip</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddStopModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
                >
                  + Add Stop
                </button>
              </div>

              {merchantDrafts.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">
                  No merchant stops added. Tap "+ Add Stop" to add food or grocery.
                </div>
              ) : (
                <div className="space-y-3">
                  {merchantDrafts.map((draft, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/70 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded font-medium bg-slate-800 text-amber-400 border border-amber-500/30">
                            Stop {idx + 1}: {draft.type === 'food' ? '🍲 Restaurant' : '🛒 Store'}
                          </span>
                          <span className="text-sm font-semibold text-slate-200">{draft.merchantName}</span>
                        </div>
                        <p className="text-xs text-slate-400">{draft.address}</p>
                        <div className="mt-2 text-xs text-slate-300">
                          {draft.items.map(it => (
                            <div key={it.id} className="flex items-center justify-between w-48">
                              <span>• {it.name} x {it.quantity}</span>
                              <span className="font-semibold text-slate-400">₹{it.price * it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMerchantStop(idx)}
                        className="text-xs text-red-400 hover:text-red-300 p-1.5"
                        title="Remove stop"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Action Bar */}
            <div className="pt-2">
              <button
                disabled={loadingQuote}
                onClick={handleReviewBundle}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/25 transition disabled:opacity-50"
              >
                {loadingQuote ? 'Pricing & Routing Stops...' : 'Review Unified Bundle Quote →'}
              </button>
            </div>
          </>
        )}

        {/* Step: Quote Review & Payment Options */}
        {step === 'quote' && quote && (
          <div className="space-y-5">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Bundle Fare Breakdown</h2>
                  <p className="text-xs text-slate-400">All legs combined in 1 single transaction</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-emerald-400">
                    ₹{(quote.totalCents / 100).toFixed(2)}
                  </div>
                  <span className="text-xs text-slate-400">Total payable</span>
                </div>
              </div>

              {/* Per-leg breakdowns */}
              <div className="space-y-3">
                {quote.breakdown.map((leg, index) => (
                  <div key={leg.legId} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span>Leg #{index + 1}: {leg.type.toUpperCase()}</span>
                      <span className="text-emerald-400 font-bold">₹{(leg.totalCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Items / Base: ₹{(leg.itemCents / 100).toFixed(2)}</span>
                      <span>Delivery / Fare: ₹{((leg.deliveryCents + leg.rideFareCents) / 100).toFixed(2)}</span>
                    </div>
                    {leg.detourCents > 0 && (
                      <div className="flex justify-between text-indigo-400">
                        <span>En-route Detour Cost:</span>
                        <span>₹{(leg.detourCents / 100).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* COD Eligibility Badge */}
              <div className="pt-2">
                {quote.codEligible ? (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <span>✓</span> AllGo Plus Active: Cash on Delivery eligible for this trip
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs">
                    ⓘ Cash on Delivery is reserved for active AllGo Plus subscribers. Instant online payment is available.
                  </div>
                )}
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-300">Choose Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['upi', 'card', 'netbanking', 'wallet'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition text-left ${
                        paymentMethod === m
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      {m.toUpperCase()}
                    </button>
                  ))}
                  {quote.codEligible && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition text-left col-span-2 ${
                        paymentMethod === 'cash'
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      💵 Cash on Delivery (AllGo Plus Verified)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('builder')}
                className="w-1/3 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition"
              >
                ← Edit Legs
              </button>
              <button
                type="button"
                disabled={isProcessingPayment}
                onClick={handleProceedToPayment}
                className="w-2/3 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/20 transition disabled:opacity-50"
              >
                {isProcessingPayment ? 'Securing Payment...' : `Pay ₹${(quote.totalCents / 100).toFixed(2)} Once →`}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Add Stop Modal */}
      {showAddStopModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Add Stop Along Journey</h3>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedServiceToAdd('food')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                  selectedServiceToAdd === 'food'
                    ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                    : 'border-slate-800 text-slate-400'
                }`}
              >
                🍲 Food
              </button>
              <button
                type="button"
                onClick={() => setSelectedServiceToAdd('grocery')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                  selectedServiceToAdd === 'grocery'
                    ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                    : 'border-slate-800 text-slate-400'
                }`}
              >
                🛒 Grocery
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-slate-400">Store / Restaurant Name</label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={e => setNewStoreName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="text-slate-400">Item Name</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="text-slate-400">Price (₹)</label>
                <input
                  type="number"
                  value={newItemPrice}
                  onChange={e => setNewItemPrice(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddStopModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddMerchantStop}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white"
              >
                Add Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
};
