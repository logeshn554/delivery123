export interface ServiceQuoteSnapshot {
  quoteId?: string;
  expiresAt: string;
  price: number;
  estimatedKm: number;
  estimatedMinutes: number;
  fareBreakdown?: ServiceFareBreakdown;
}

export interface ServiceFareBreakdown {
  baseCents: number;
  distanceCents: number;
  timeCents: number;
  weightCents: number;
  minimumAdjustmentCents: number;
  insuranceCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export type ParcelFareBreakdown = ServiceFareBreakdown;

function isValidParcelFareBreakdown(value: ServiceFareBreakdown): boolean {
  const nonNegative = [value.baseCents, value.distanceCents, value.timeCents, value.weightCents, value.insuranceCents, value.subtotalCents, value.discountCents, value.totalCents];
  return nonNegative.every(amount => Number.isSafeInteger(amount) && amount >= 0)
    && Number.isSafeInteger(value.minimumAdjustmentCents)
    && value.baseCents + value.distanceCents + value.timeCents + value.weightCents + value.minimumAdjustmentCents + value.insuranceCents === value.subtotalCents
    && value.subtotalCents - value.discountCents === value.totalCents;
}

export function isValidServiceQuote(quote: ServiceQuoteSnapshot): boolean {
  return typeof quote.quoteId === 'string'
    && quote.quoteId.trim().length > 0
    && Number.isFinite(Date.parse(quote.expiresAt))
    && Number.isFinite(quote.price)
    && quote.price > 0
    && Number.isFinite(quote.estimatedKm)
    && quote.estimatedKm >= 0
    && Number.isSafeInteger(quote.estimatedMinutes)
    && quote.estimatedMinutes >= 0
    && (quote.fareBreakdown === undefined || (isValidParcelFareBreakdown(quote.fareBreakdown) && quote.price === quote.fareBreakdown.totalCents / 100));
}

export function isServiceQuoteExpired(expiresAt: string, now: number): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now;
}
