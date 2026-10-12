const LIVE_WINDOW_MS = 60_000;

export function isFreshTrackingTimestamp(value: string, now: number, maxAgeMs = LIVE_WINDOW_MS): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && Number.isFinite(now)
    && Number.isFinite(maxAgeMs)
    && maxAgeMs > 0
    && timestamp <= now
    && now - timestamp < maxAgeMs;
}

export interface TrackingRouteSnapshot {
  distanceMeters: number;
  estimatedMinutes: number;
  calculatedAt: string;
  destination: string;
}

export function isFreshTrackingRoute(route: TrackingRouteSnapshot, now: number): boolean {
  return Number.isFinite(route.distanceMeters)
    && route.distanceMeters >= 0
    && Number.isSafeInteger(route.estimatedMinutes)
    && route.estimatedMinutes >= 0
    && (route.destination === 'pickup' || route.destination === 'drop')
    && isFreshTrackingTimestamp(route.calculatedAt, now);
}
