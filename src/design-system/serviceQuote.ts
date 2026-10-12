export interface ServiceQuoteSnapshot {
  quoteId?: string;
  expiresAt: string;
  price: number;
  estimatedKm: number;
  estimatedMinutes: number;
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
    && quote.estimatedMinutes >= 0;
}

export function isServiceQuoteExpired(expiresAt: string, now: number): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now;
}
