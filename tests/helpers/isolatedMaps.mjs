// Deterministic external boundary for emulator-only journey tests. Never contacts a provider.
export function mockJourneyMaps() {
  const originalFetch = globalThis.fetch, previousMapsKey = process.env.MAPS_API_KEY;
  process.env.MAPS_API_KEY = 'isolated-test-map-key';
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    if (url.hostname === 'maps.googleapis.com') {
      const pickup = url.searchParams.get('address')?.includes('Merchant') || url.searchParams.get('place_id') === 'pickup-place';
      return Response.json({ status: 'OK', results: [{
        place_id: pickup ? 'pickup-place' : 'drop-place',
        formatted_address: pickup ? 'Merchant pickup street' : 'Customer delivery street',
        geometry: { location: { lat: pickup ? 13.081 : 13.082, lng: 80.271 } },
      }] });
    }
    if (url.hostname === 'routes.googleapis.com') return Response.json({ routes: [{ distanceMeters: 1000, duration: '300s' }] });
    if (url.hostname === '127.0.0.1' && url.port === '8080') return originalFetch(input, options);
    throw new Error(`Unexpected external call in isolated journey: ${url.origin}`);
  };
  return () => {
    globalThis.fetch = originalFetch;
    if (previousMapsKey === undefined) delete process.env.MAPS_API_KEY;
    else process.env.MAPS_API_KEY = previousMapsKey;
  };
}
