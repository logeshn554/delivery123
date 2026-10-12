const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLegRefund, getLegRefundIdempotencyKey, buildLegRefundJournal } = require('./perLegRefundPolicy');

test('perLegRefundPolicy - computeLegRefund', () => {
  const cancellableLeg = {
    legId: 'leg_123',
    status: 'pending',
    priceBreakdown: {
      totalCents: 4500,
    },
  };

  const result = computeLegRefund(cancellableLeg, 'User changed mind');
  assert.equal(result.cancellable, true);
  assert.equal(result.refundCents, 4500);
  assert.equal(result.legId, 'leg_123');

  // Already cancelled leg -> idempotent safe handling
  const cancelledLeg = { ...cancellableLeg, status: 'cancelled' };
  const cancelledResult = computeLegRefund(cancelledLeg);
  assert.equal(cancelledResult.cancellable, false);
  assert.equal(cancelledResult.alreadyCancelled, true);
  assert.equal(cancelledResult.refundCents, 0);

  // Completed or delivered leg -> cannot cancel
  assert.throws(() => computeLegRefund({ ...cancellableLeg, status: 'completed' }), /Completed or delivered legs cannot be cancelled/);
  assert.throws(() => computeLegRefund({ ...cancellableLeg, status: 'delivered' }), /Completed or delivered legs cannot be cancelled/);

  // Transit leg -> cannot cancel
  assert.throws(() => computeLegRefund({ ...cancellableLeg, status: 'transit' }), /already in transit/);

  // Missing or invalid breakdown
  assert.throws(() => computeLegRefund({ ...cancellableLeg, priceBreakdown: null }), /price breakdown is invalid/);
  assert.throws(() => computeLegRefund({ ...cancellableLeg, priceBreakdown: { totalCents: -100 } }), /price breakdown is invalid/);
});

test('perLegRefundPolicy - getLegRefundIdempotencyKey', () => {
  assert.equal(getLegRefundIdempotencyKey('pay_abc123', 'leg_xyz987'), 'pay_abc123:leg:leg_xyz987');
  assert.throws(() => getLegRefundIdempotencyKey('', 'leg_1'), /required/);
  assert.throws(() => getLegRefundIdempotencyKey('pay_1', ''), /required/);
});

test('perLegRefundPolicy - buildLegRefundJournal', () => {
  const j = buildLegRefundJournal('bundle_1', 'leg_1', 2500, { customerId: 'cust_1' });
  assert.equal(j.kind, 'bundle_leg_refund');
  assert.equal(j.amountCents, 2500);
  assert.equal(j.references.bundleId, 'bundle_1');
  assert.equal(j.references.legId, 'leg_1');
  assert.equal(j.references.customerId, 'cust_1');
  assert.equal(j.lines[0].account, 'booking_funds_unallocated');
  assert.equal(j.lines[0].debitCents, 2500);
  assert.equal(j.lines[1].account, 'provider_clearing');
  assert.equal(j.lines[1].creditCents, 2500);
});
