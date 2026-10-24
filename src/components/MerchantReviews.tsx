import { useCallback, useEffect, useRef, useState } from 'react';
import { listMerchantOrderReviews, type MerchantOrderReview } from '../data/firestoreHelper';

export default function MerchantReviews({ merchantId, merchantType }: { merchantId: string; merchantType: 'restaurant' | 'grocery' }) {
  const [reviews, setReviews] = useState<MerchantOrderReview[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const actionLock = useRef(false);
  const load = useCallback(async (nextCursor: string | null = null) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setLoading(true); setError('');
    try {
      const page = await listMerchantOrderReviews({ merchantId, merchantType, cursor: nextCursor });
      setReviews(current => nextCursor ? [...current, ...page.reviews] : page.reviews);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Customer feedback could not be loaded.');
    } finally { setLoading(false); actionLock.current = false; }
  }, [merchantId, merchantType]);
  useEffect(() => { setReviews([]); setCursor(null); void load(null); }, [load]);

  return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4" aria-label="Customer ratings and feedback">
    <div><h2 className="font-bold">Customer ratings & feedback</h2><p className="text-xs text-slate-400">Verified reviews for completed orders at this business.</p></div>
    {loading && reviews.length === 0 && <p role="status" className="text-sm">Loading customer feedback…</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-rose-300"><p>{error}</p><button type="button" onClick={() => void load(null)} className="min-h-11 rounded border border-rose-700 px-3">Retry</button></div>}
    {!loading && !error && reviews.length === 0 && <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">No customer reviews have been submitted for this business yet.</p>}
    {reviews.map(review => <article key={review.reviewId} className="space-y-1 rounded-lg border border-slate-700 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong aria-label={review.rating ? `${review.rating} out of 5 stars` : 'Rating unavailable'}>{'★'.repeat(Math.max(0, Math.min(5, review.rating)))}{'☆'.repeat(Math.max(0, 5 - review.rating))} <span className="text-xs">{review.rating ? `${review.rating}/5` : 'Rating unavailable'}</span></strong><time className="text-xs text-slate-400" dateTime={review.createdAt}>{Number.isFinite(Date.parse(review.createdAt)) ? new Date(review.createdAt).toLocaleString() : 'Date unavailable'}</time></div>
      <p className="text-xs text-slate-400">Order {review.bookingId}</p>
      {review.comment && <p className="whitespace-pre-wrap text-sm">{review.comment}</p>}
    </article>)}
    {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)} className="min-h-11 rounded border border-slate-600 px-3 text-sm disabled:opacity-50">{loading ? 'Loading…' : 'Load more reviews'}</button>}
  </section>;
}
