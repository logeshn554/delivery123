import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import BundleLegChat from '../features/tracking/BundleLegChat';
import { db, functions } from '../firebase';
import { useFeedbackDialog } from './useFeedbackDialog';
import type { TripBundle, BundleLeg } from '../types';

interface BundleTrackingScreenProps {
  bundleId: string;
  onBack: () => void;
}

interface BundleTrackingDoc {
  legs?: Record<
    string,
    {
      driverId: string;
      currentLat: number;
      currentLng: number;
      locationAccuracyMeters?: number;
      locationUpdatedAt?: string;
    }
  >;
  updatedAt?: string;
}

export const BundleTrackingScreen: React.FC<BundleTrackingScreenProps> = ({ bundleId, onBack }) => {
  const { alert, confirm, dialog } = useFeedbackDialog();

  const [bundle, setBundle] = useState<TripBundle | null>(null);
  const [legs, setLegs] = useState<BundleLeg[]>([]);
  const [tracking, setTracking] = useState<BundleTrackingDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLegId, setExpandedLegId] = useState<string | null>(null);
  const [cancellingLegId, setCancellingLegId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // Chat state
  const [activeChatLegId, setActiveChatLegId] = useState<string | null>(null);

  // Firestore real-time listeners for bundle, legs, and bundle_tracking
  useEffect(() => {
    let active = true;
    setBundle(null); setLegs([]); setTracking(null); setExpandedLegId(null);
    setActiveChatLegId(null);
    setLoading(true); setError(null);
    if (!bundleId) { setLoading(false); setError('Choose a journey from Activity.'); return; }
    const timeout = setTimeout(() => { if (active) { setLoading(false); setError('Journey status is taking too long. Check your connection and reopen it from Activity.'); } }, 15000);

    // 1. Bundle parent doc listener
    const unsubBundle = onSnapshot(
      doc(db, 'bundles', bundleId),
      snap => {
        if (!active) return;
        clearTimeout(timeout);
        if (snap.exists()) {
          setError(null);
          setBundle(snap.data() as TripBundle);
          setLoading(false);
        } else {
          setError('Bundle not found.');
          setLoading(false);
        }
      },
      err => {
        if (!active) return;
        clearTimeout(timeout);
        console.error('Bundle status subscription failed:', err);
        setError('Journey status could not load. Check your connection and try again.');
        setLoading(false);
      }
    );

    // 2. Child legs subcollection listener
    const unsubLegs = onSnapshot(
      collection(db, 'bundles', bundleId, 'legs'),
      snap => {
        if (!active) return;
        const legList = snap.docs.map(d => ({ legId: d.id, ...d.data() } as BundleLeg));
        legList.sort((a, b) => a.legIndex - b.legIndex);
        setLegs(legList);
        setExpandedLegId(current => current && legList.some(leg => leg.legId === current) ? current : legList[0]?.legId || null);
      },
      err => {
        if (active) { console.error('Bundle stops subscription failed:', err); setError('Journey stops could not load. Check your connection and try again.'); }
      }
    );

    // 3. Driver tracking aggregated doc listener
    const unsubTracking = onSnapshot(
      doc(db, 'bundle_tracking', bundleId),
      snap => {
        if (active) setTracking(snap.exists() ? snap.data() as BundleTrackingDoc : null);
      },
      err => {
        if (active) setTracking(null);
        console.error('Tracking subscription warning:', err);
      }
    );

    return () => {
      active = false; clearTimeout(timeout);
      unsubBundle();
      unsubLegs();
      unsubTracking();
    };
  }, [bundleId, retry]);

  // Cancel individual leg handler
  const handleCancelLeg = async (leg: BundleLeg) => {
    const isConfirmed = await confirm(
      `Are you sure you want to cancel Leg #${leg.legIndex + 1} (${leg.type})? Refund eligibility and settlement must be checked after cancellation.`
    );
    if (!isConfirmed) return;

    setCancellingLegId(leg.legId);
    try {
      const cancelCallable = httpsCallable<{ bundleId: string; legId: string; reason?: string }, any>(
        functions,
        'cancelBundleLeg'
      );
      const res = await cancelCallable({
        bundleId,
        legId: leg.legId,
        reason: 'Customer initiated per-leg cancellation',
      });
      alert(`Cancellation processed. Refund status: ${res.data?.refundStatus || 'check with support'}. Requested refund amount: ₹${((res.data?.refundCents || 0) / 100).toFixed(2)}. Only a processed refund is settled.`);
    } catch (err: any) {
      alert(`Could not cancel leg: ${err.message || 'Operation failed'}`);
    } finally {
      setCancellingLegId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-0 bg-white text-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-600">Loading journey status…</p>
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="min-h-0 bg-white text-slate-900 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-700 flex items-center justify-center text-2xl font-bold mb-4">
          ⚠️
        </div>
        <h2 className="text-lg font-bold mb-2">Trip Tracking Error</h2>
        <p className="text-sm text-slate-600 max-w-sm mb-6">{error || 'Could not locate trip details.'}</p>
        {!!bundleId && <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 mb-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white">Try again</button>}
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-sm font-semibold border border-slate-200 transition"
        >
          ← Return to App
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    active: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30',
    partial: 'bg-purple-500/10 text-purple-700 border-purple-500/30',
    completed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    cancelled: 'bg-red-500/10 text-red-700 border-red-500/30',
  };

  return (
    <div className="min-h-0 bg-white text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <div className="border-b border-slate-200 py-3 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
            aria-label="Back"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900">Combined journey status</h1>
            <p className="text-xs text-slate-600 font-mono">ID: {bundle.bundleId.slice(0, 16)}…</p>
          </div>
        </div>
        <span
          className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${
            statusColors[bundle.status] || 'bg-slate-50 text-slate-700'
          }`}
        >
          {bundle.status}
        </span>
      </div>

      {/* Main Tracking Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-6">
        {/* Map Visualizer Card */}
        <section className="bg-slate-50/80 border border-slate-200/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="h-44 bg-slate-50 p-4 relative flex flex-col justify-between">
            <div className="flex items-center justify-between z-10">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/80 border border-slate-200 text-slate-700 backdrop-blur-sm">
                Journey progress
              </span>
              <span className="text-xs text-slate-600">
                {Object.keys(tracking?.legs || {}).length} location record(s)
              </span>
            </div>

            {/* Simulated Live Route Canvas Pins */}
            <div className="relative w-full h-24 flex items-center justify-around z-10">
              {legs.map((leg, i) => {
                const trk = tracking?.legs?.[leg.legId];
                return (
                  <div key={leg.legId} className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 transition transform hover:scale-110 ${
                        leg.status === 'completed' || leg.status === 'delivered'
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : leg.status === 'cancelled'
                          ? 'bg-red-600 border-red-400 text-white'
                          : trk
                          ? 'bg-indigo-600 border-indigo-400 text-white animate-pulse'
                          : 'bg-slate-100 border-slate-500 text-slate-700'
                      }`}
                    >
                      {leg.type === 'ride' ? '🚗' : leg.type === 'food' ? '🍲' : '🛒'}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-700 mt-1">
                      Leg #{i + 1}
                    </span>
                    <span className="text-[9px] text-slate-600 capitalize">{leg.status}</span>
                  </div>
                );
              })}
            </div>

            <div className="text-[10px] text-slate-500 flex justify-between z-10">
              <span>Status diagram only. Geographic GPS tracking is not available here.</span>
            </div>
          </div>
        </section>

        {/* Per-Leg Accordion List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Trip Legs & Multi-Stop Details</h2>
            <span className="text-xs text-slate-600">{legs.length} Total Legs</span>
          </div>

          {legs.map(leg => {
            const isExpanded = expandedLegId === leg.legId;
            const isCancellable = !['completed', 'delivered', 'cancelled', 'transit'].includes(leg.status);

            return (
              <div
                key={leg.legId}
                className="bg-slate-50/60 border border-slate-200/60 rounded-2xl overflow-hidden shadow-md backdrop-blur-sm transition"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`Journey stop ${leg.legIndex + 1}: ${leg.type}, ${leg.status}`}
                  onClick={() => setExpandedLegId(isExpanded ? null : leg.legId)}
                  aria-controls={`bundle-leg-${leg.legId}`}
                  className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-base">
                      {leg.type === 'ride' ? '🚗' : leg.type === 'food' ? '🍲' : '🛒'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          Leg #{leg.legIndex + 1}: {leg.type.toUpperCase()}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-white text-indigo-700 border border-indigo-500/20">
                          {leg.fulfillmentMethod === 'ride_driver' ? 'Ride partner pickup' : leg.fulfillmentMethod === 'self_pickup' ? 'Customer pickup' : leg.fulfillmentMethod === 'separate_partner' ? 'Dedicated partner' : 'Fulfillment not assigned'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {leg.driverName ? `Assigned to: ${leg.driverName}` : leg.fulfillmentMethod === 'self_pickup' ? 'Customer pickup' : 'No partner assignment shown'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                        statusColors[leg.status] || 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      {leg.status}
                    </span>
                    <span className="text-slate-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Accordion Body */}
                {isExpanded && (
                  <div id={`bundle-leg-${leg.legId}`} className="p-4 pt-0 border-t border-slate-200/50 space-y-3 text-xs">
                    {leg.refundStatus && <p className="mt-3 rounded-xl border p-3">Refund status: <strong>{leg.refundStatus.replaceAll('_', ' ')}</strong>{leg.refundId && <span className="block break-all">Reference: {leg.refundId}</span>}</p>}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="p-2.5 bg-white/60 rounded-xl border border-slate-200">
                        <span className="text-slate-500 block">Pickup Address</span>
                        <span className="text-slate-800 font-medium">{leg.pickupAddress || 'Origin'}</span>
                      </div>
                      <div className="p-2.5 bg-white/60 rounded-xl border border-slate-200">
                        <span className="text-slate-500 block">Drop Address</span>
                        <span className="text-slate-800 font-medium">{leg.dropAddress || 'Destination'}</span>
                      </div>
                    </div>

                    {/* Items if commerce leg */}
                    {leg.items && leg.items.length > 0 && (
                      <div className="p-2.5 bg-white/60 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-slate-500 block">Ordered Items</span>
                        {leg.items.map(it => (
                          <div key={it.id} className="flex justify-between text-slate-700">
                            <span>• {it.name} (x{it.quantity})</span>
                            <span>₹{it.price * it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action buttons: Chat & Cancel */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveChatLegId(activeChatLegId === leg.legId ? null : leg.legId)}
                        className="min-h-11 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold transition-colors"
                      >
                        💬 Chat with Partner
                      </button>

                      {isCancellable && (
                        <button
                          type="button"
                          disabled={cancellingLegId !== null}
                          onClick={() => handleCancelLeg(leg)}
                          className="min-h-11 px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-700 border border-red-500/30 font-semibold transition-colors disabled:opacity-50"
                        >
                          {cancellingLegId === leg.legId ? 'Cancelling…' : 'Cancel This Leg'}
                        </button>
                      )}
                    </div>

                    {activeChatLegId === leg.legId && <BundleLegChat key={`${bundleId}:${leg.legId}`} bundleId={bundleId} legId={leg.legId} />}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Global Support Help */}
        <div className="text-center pt-2">
          <p className="text-xs text-slate-500">
            Need help with your unified journey? Open Support in your account for help.
          </p>
        </div>
      </main>

      {dialog}
    </div>
  );
};
