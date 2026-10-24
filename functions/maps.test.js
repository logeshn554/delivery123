const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeBetween, mapPreview } = require('./maps');

function routeResponse(duration = '840s') {
  return new Response(JSON.stringify({ routes: [{ distanceMeters: 5200, duration }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('tracking route can request a traffic-aware duration without changing quote defaults', async () => {
  const originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return routeResponse(); };
  try {
    const origin = { location: { lat: 13.08, lng: 80.27 } }, destination = { placeId: 'destination-place' };
    const quoteRoute = await routeBetween('maps-key', origin, destination);
    const liveRoute = await routeBetween('maps-key', origin, destination, 'DRIVE', 'TRAFFIC_AWARE');

    assert.deepEqual(quoteRoute, { distanceMeters: 5200, durationSeconds: 840 });
    assert.deepEqual(liveRoute, quoteRoute);
    assert.equal(JSON.parse(requests[0].options.body).routingPreference, 'TRAFFIC_UNAWARE');
    assert.equal(JSON.parse(requests[1].options.body).routingPreference, 'TRAFFIC_AWARE');
    assert.equal(requests[0].url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  } finally { globalThis.fetch = originalFetch; }
});

test('route estimation rejects unsupported traffic preferences before provider calls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Provider must not be called'); };
  try {
    await assert.rejects(routeBetween('maps-key', { location: { lat: 13, lng: 80 } }, { placeId: 'destination' }, 'DRIVE', 'TRAFFIC_AWARE_OPTIMAL'), error => error.code === 'failed-precondition');
  } finally { globalThis.fetch = originalFetch; }
});

test('map picker previews validate coordinates and accept only bounded PNG responses', async () => {
  const originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async url => {
    requests.push(String(url));
    return new Response(Buffer.from('png-image'), { status: 200, headers: { 'Content-Type': 'image/png' } });
  };
  try {
    await assert.rejects(mapPreview('maps-key', { lat: 91, lng: 0 }), error => error.code === 'invalid-argument');
    const result = await mapPreview('maps-key', { lat: 13.08, lng: 80.27 }, 16);
    const request = new URL(requests[0]);
    assert.equal(result.image, Buffer.from('png-image').toString('base64'));
    assert.equal(request.hostname, 'maps.googleapis.com');
    assert.equal(request.searchParams.get('center'), '13.08,80.27');
    assert.equal(request.searchParams.get('size'), '640x400');
    assert.equal(request.searchParams.get('scale'), '2');
    assert.equal(request.searchParams.get('zoom'), '16');
  } finally { globalThis.fetch = originalFetch; }
});
