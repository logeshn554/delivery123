const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalSignature, signatureSvg, deliveryProofPolicy, activeRetention } = require('./deliveryProof');

test('recipient signature geometry is bounded, normalized, and rendered as server-generated SVG', () => {
  const strokes = canonicalSignature([[{ x: 0, y: 0.5 }, { x: 0.5, y: 0.25 }, { x: 1, y: 0.5 }, { x: 0.7, y: 0.8 }]]);
  const svg = signatureSvg(strokes);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /M 0\.00 100\.00 L 320\.00 50\.00/);
  assert.doesNotMatch(svg, /<script|javascript:|onload=/i);
  for (const value of [null, [], [[]], [[{ x: 0, y: 0 }, { x: 2, y: 1 }]], [[{ x: NaN, y: 0 }, { x: 1, y: 1 }]]]) assert.throws(() => canonicalSignature(value));
});

test('signature policy fails closed without an enabled, versioned policy and bounded retention', () => {
  const policy = { enabled: true, version: 2, retentionDays: 180, privacyPolicyUrl: 'https://example.test/privacy' };
  assert.deepEqual(deliveryProofPolicy(policy), { ...policy, privacyPolicyUrl: 'https://example.test/privacy' });
  for (const value of [{ ...policy, enabled: false }, { ...policy, version: 0 }, { ...policy, retentionDays: 0 }, { ...policy, retentionDays: 3651 }, { ...policy, privacyPolicyUrl: 'http://example.test/privacy' }]) assert.throws(() => deliveryProofPolicy(value));
});

test('proof retention accepts only canonical future timestamps', () => {
  const now = Date.parse('2026-10-24T00:00:00.000Z');
  assert.equal(activeRetention('2026-10-25T00:00:00.000Z', now), true);
  assert.equal(activeRetention('2026-10-24T00:00:00.000Z', now), false);
  assert.equal(activeRetention('not-a-date', now), false);
});
