import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeWorkspaceBookings } from '../../src/app/bookingSubscription';
import type { Booking, UserProfile } from '../../src/types';

function harness() {
  const calls: unknown[][] = [];
  const received: Booking[][] = [];
  let emit: (rows: Booking[]) => void = () => {};
  let stopped = 0;
  const listen = (name: string, args: unknown[], callback: typeof emit) => {
    calls.push([name, ...args]); emit = callback; return () => { stopped++; };
  };
  const listeners = {
    listenToBookings: (cb: typeof emit) => listen('admin', [], cb),
    listenToCustomerBookings: (uid: string, cb: typeof emit) => listen('customer', [uid], cb),
    listenToDriverBookings: (uid: string, cb: typeof emit) => listen('driver', [uid], cb),
    listenToMerchantBookings: (id: string, type: 'restaurant' | 'grocery', cb: typeof emit) => listen('merchant', [id, type], cb),
  };
  return { calls, received, listeners, receive: (rows: Booking[]) => received.push(rows), emit: (rows: Booking[]) => emit(rows), stopped: () => stopped };
}

test('operations workspace is available only in the customer app', () => {
  const customer = harness();
  subscribeWorkspaceBookings('customer', 'staff', { role: 'admin' }, customer.listeners, customer.receive);
  assert.deepEqual(customer.calls, [['admin']]);
  for (const audience of ['merchant', 'driver'] as const) {
    const h = harness();
    subscribeWorkspaceBookings(audience, 'staff', { role: 'admin' }, h.listeners, h.receive);
    assert.deepEqual(h.calls, []);
  }
});

test('non-admin accounts in the customer app retain only their personal orders', () => {
  for (const role of ['customer', 'merchant', 'driver'] as const) {
    const h = harness();
    subscribeWorkspaceBookings('customer', 'buyer', { role }, h.listeners, h.receive);
    assert.deepEqual(h.calls, [['customer', 'buyer']]);
  }
});

test('partner feeds use assigned identity and incomplete merchant profiles subscribe to nothing', () => {
  const cases: [Pick<UserProfile, 'role' | 'merchantId' | 'merchantType'>, unknown[][]][] = [
    [{ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' }, [['merchant', 'shop', 'grocery']]],
    [{ role: 'merchant' }, []],
    [{ role: 'customer' }, []],
  ];
  for (const [profile, expected] of cases) {
    const h = harness();
    subscribeWorkspaceBookings('merchant', 'partner', profile, h.listeners, h.receive);
    assert.deepEqual(h.calls, expected);
    assert.deepEqual(h.received, [[]]);
  }
  const driver = harness();
  subscribeWorkspaceBookings('driver', 'partner', { role: 'driver' }, driver.listeners, driver.receive);
  assert.deepEqual(driver.calls, [['driver', 'partner']]);
  const mismatch = harness();
  subscribeWorkspaceBookings('driver', 'partner', { role: 'merchant' }, mismatch.listeners, mismatch.receive);
  assert.deepEqual(mismatch.calls, []);
});

test('switching scope clears previous records and ignores callbacks after teardown', () => {
  const h = harness();
  const stop = subscribeWorkspaceBookings('customer', 'staff', { role: 'admin' }, h.listeners, h.receive);
  const rows = [{ bookingId: 'someone-elses-order' }] as Booking[];
  h.emit(rows);
  stop();
  h.emit(rows);
  assert.equal(h.stopped(), 1);
  assert.deepEqual(h.received, [[], rows]);
  subscribeWorkspaceBookings('customer', 'staff', { role: 'customer' }, h.listeners, h.receive);
  assert.deepEqual(h.received.at(-1), []);
  assert.deepEqual(h.calls.at(-1), ['customer', 'staff']);
});
