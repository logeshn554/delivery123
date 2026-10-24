import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEscPosReceipt } from '../../src/design-system/escPos.ts';
import type { Booking } from '../../src/types.ts';

const booking: Booking = {
  bookingId: 'receipt_123', customerId: 'customer_1', customerName: 'Test', serviceType: 'food', status: 'preparing',
  createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:01:00.000Z', price: 55,
  paymentStatus: 'paid', paymentMethod: 'upi', details: { items: [{ id: 'dish_1', name: 'Dosa × Special', quantity: 1, price: 55 }] },
};

test('ESC/POS receipt is bounded, printable ASCII with init/feed/cut commands', () => {
  const bytes = buildEscPosReceipt(booking);
  const text = new TextDecoder().decode(bytes);
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [0x1b, 0x40]);
  assert.match(text, /Order: receipt_123/);
  assert.match(text, /Dosa x Special/);
  assert.match(text, /Rs 55\.00/);
  assert.deepEqual(Array.from(bytes.slice(-8)), [10, 10, 10, 29, 86, 66, 0, 0]);
  assert.equal([...bytes].every(byte => byte <= 0x7f), true);
});

test('ESC/POS receipt rejects unsupported paper widths', () => {
  assert.throws(() => buildEscPosReceipt(booking, 12), /Unsupported printer paper width/);
});
