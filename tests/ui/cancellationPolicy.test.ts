import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../../src/components/CancellationPolicyNotice.tsx', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../../src/components/CheckoutReviewScreen.tsx', import.meta.url), 'utf8');
const customerPages = readFileSync(new URL('../../src/components/CustomerPages.tsx', import.meta.url), 'utf8');

test('checkout and account policy settings state the server-enforced cancellation and refund behavior', () => {
  assert.match(policy, /only while its status is Pending/);
  assert.match(policy, /refund of the full amount paid with no cancellation fee/);
  assert.match(policy, /Wallet refunds are recorded immediately/);
  assert.match(policy, /payment-provider refunds can take time/);
  assert.match(policy, /cancellation removes the amount due/);
  assert.match(checkout, /<CancellationPolicyNotice \/>/);
  assert.match(customerPages, /<CancellationPolicyNotice className="allgo-card"\/>/);
  assert.doesNotMatch(checkout, /published cancellation policy is not available yet/);
});
