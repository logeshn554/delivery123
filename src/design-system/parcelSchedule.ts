export function isFuturePickupRequest(value: string, now = Date.now()): boolean {
  const timestamp = Date.parse(value);
  return value.length > 0 && Number.isFinite(timestamp) && timestamp > now;
}
