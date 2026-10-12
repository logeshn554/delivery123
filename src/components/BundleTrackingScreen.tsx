import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../firebase';
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

  // Chat state
  const [activeChatLegId, setActiveChatLegId] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Firestore real-time listeners for bundle, legs, and bundle_tracking
  useEffect(() => {
    if (!bundleId) return;
    setLoading(true);
    setError(null);

    // 1. Bundle parent doc listener
    const unsubBundle = onSnapshot(
      doc(db, 'bundles', bundleId),
      snap => {
        if (snap.exists()) {
          setBundle(snap.data() as TripBundle);
          setLoading(false);
        } else {
          setError('Bundle not found.');
          setLoading(false);
        }
      },
      err => {
        setError(`Failed to subscribe to bundle: ${err.message}`);
        setLoading(false);
      }
    );

    // 2. Child legs subcollection listener
    const unsubLegs = onSnapshot(
      collection(db, 'bundles', bundleId, 'legs'),
      snap => {
        const legList = snap.docs.map(d => ({ legId: d.id, ...d.data() } as BundleLeg));
        legList.sort((a, b) => a.legIndex - b.legIndex);
        setLegs(legList);
        if (legList.length > 0 && !expandedLegId) {
          setExpandedLegId(legList[0].legId);
        }
      },
      err => {
        console.error('Failed to load bundle legs:', err);
      }
    );

    // 3. Driver tracking aggregated doc listener
    const unsubTracking = onSnapshot(
      doc(db, 'bundle_tracking', bundleId),
      snap => {
        if (snap.exists()) {
          setTracking(snap.data() as BundleTrackingDoc);
        }
      },
      err => {
        console.error('Tracking subscription warning:', err);
      }
    );

    return () => {
      unsubBundle();
      unsubLegs();
      unsubTracking();
    };
  }, [bundleId]);

  // Cancel individual leg handler
  const handleCancelLeg = async (leg: BundleLeg) => {
    const isConfirmed = await confirm(
      `Are you sure you want to cancel Leg #${leg.legIndex + 1} (${leg.type})? A refund will be issued for this leg automatically.`
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
      alert(`Leg cancelled successfully. Refund amount: ₹${((res.data?.refundCents || 0) / 100).toFixed(2)}.`);
    } catch (err: any) {
      alert(`Could not cancel leg: ${err.message || 'Operation failed'}`);
    } finally {
      setCancellingLegId(null);
    }
  };

  // Send message for this leg
  const handleSendMessage = async () => {
    if (!activeChatLegId || !chatMessage.trim()) return;
    setIsSendingMessage(true);
    try {
      // In Firestore rules, chats are scoped at bundles/{bundleId}/legs/{legId}/chats/{chatId}
      const chatRef = collection(db, 'bundles', bundleId, 'legs', activeChatLegId, 'chats');
      const { addDoc } = await import('firebase/firestore');
      await addDoc(chatRef, {
        senderId: auth.currentUser?.uid || 'customer',
        senderName: 'Customer',
        text: chatMessage.trim(),
        timestamp: new Date().toISOString(),
      });
      setChatMessage('');
      alert('Message sent to assigned partner.');
    } catch (err: any) {
      alert(`Message failed: ${err.message || 'Could not send'}`);
    } finally {
      setIsSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400">Loading unified trip live tracking...</p>
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-2xl font-bold mb-4">
          ⚠️
        </div>
        <h2 className="text-lg font-bold mb-2">Trip Tracking Error</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6">{error || 'Could not locate trip details.'}</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold border border-slate-700 transition"
        >
          ← Return to App
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    active: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    partial: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            aria-label="Back"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-100">Unified Live Trip Status</h1>
            <p className="text-xs text-slate-400 font-mono">ID: {bundle.bundleId.slice(0, 16)}...</p>
          </div>
        </div>
        <span
          className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${
            statusColors[bundle.status] || 'bg-slate-800 text-slate-300'
          }`}
        >
          {bundle.status}
        </span>
      </header>

      {/* Main Tracking Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-6">
        {/* Map Visualizer Card */}
        <section className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="h-44 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 p-4 relative flex flex-col justify-between">
            <div className="flex items-center justify-between z-10">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-300 backdrop-blur-sm">
                🛰️ Live GPS Radar (Unified)
              </span>
              <span className="text-xs text-slate-400">
                {Object.keys(tracking?.legs || {}).length} active vehicle(s)
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
                          : 'bg-slate-700 border-slate-500 text-slate-300'
                      }`}
                    >
                      {leg.type === 'ride' ? '🚗' : leg.type === 'food' ? '🍲' : '🛒'}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-300 mt-1">
                      Leg #{i + 1}
                    </span>
                    <span className="text-[9px] text-slate-400 capitalize">{leg.status}</span>
                  </div>
                );
              })}
            </div>

            <div className="text-[10px] text-slate-500 flex justify-between z-10">
              <span>All partners updating live on one coordinate map</span>
              <span>Synced {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </section>

        {/* Per-Leg Accordion List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200">Trip Legs & Multi-Stop Details</h2>
            <span className="text-xs text-slate-400">{legs.length} Total Legs</span>
          </div>

          {legs.map(leg => {
            const isExpanded = expandedLegId === leg.legId;
            const isCancellable = !['completed', 'delivered', 'cancelled', 'transit'].includes(leg.status);

            return (
              <div
                key={leg.legId}
                className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-md backdrop-blur-sm transition"
              >
                {/* Accordion Header */}
                <div
                  onClick={() => setExpandedLegId(isExpanded ? null : leg.legId)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/80 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-base">
                      {leg.type === 'ride' ? '🚗' : leg.type === 'food' ? '🍲' : '🛒'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">
                          Leg #{leg.legIndex + 1}: {leg.type.toUpperCase()}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-900 text-indigo-400 border border-indigo-500/20">
                          {leg.fulfillmentMethod === 'ride_driver' ? 'Detour Pickup' : 'Dedicated Partner'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {leg.driverName ? `Assigned to: ${leg.driverName}` : 'Assigning nearest partner...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                        statusColors[leg.status] || 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {leg.status}
                    </span>
                    <span className="text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Accordion Body */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-700/50 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block">Pickup Address</span>
                        <span className="text-slate-200 font-medium">{leg.pickupAddress || 'Origin'}</span>
                      </div>
                      <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block">Drop Address</span>
                        <span className="text-slate-200 font-medium">{leg.dropAddress || 'Destination'}</span>
                      </div>
                    </div>

                    {/* Items if commerce leg */}
                    {leg.items && leg.items.length > 0 && (
                      <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-slate-500 block">Ordered Items</span>
                        {leg.items.map(it => (
                          <div key={it.id} className="flex justify-between text-slate-300">
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
                        className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold transition"
                      >
                        💬 Chat with Partner
                      </button>

                      {isCancellable && (
                        <button
                          type="button"
                          disabled={cancellingLegId === leg.legId}
                          onClick={() => handleCancelLeg(leg)}
                          className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-semibold transition disabled:opacity-50"
                        >
                          {cancellingLegId === leg.legId ? 'Refunding...' : 'Cancel This Leg'}
                        </button>
                      )}
                    </div>

                    {/* Chat Drawer */}
                    {activeChatLegId === leg.legId && (
                      <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-700 mt-2 space-y-2">
                        <span className="text-xs font-semibold text-slate-300">Direct Leg Chat</span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={chatMessage}
                            onChange={e => setChatMessage(e.target.value)}
                            placeholder="Message driver..."
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={isSendingMessage}
                            onClick={handleSendMessage}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-500 transition"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Global Support Help */}
        <div className="text-center pt-2">
          <p className="text-xs text-slate-500">
            Need help with your unified journey? Contact 24/7 AllGo Operations Support.
          </p>
        </div>
      </main>

      {dialog}
    </div>
  );
};
