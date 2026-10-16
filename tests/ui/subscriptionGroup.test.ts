import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionGroup } from '../../src/data/subscriptionGroup';
import { subscribeWorkspaceBookings } from '../../src/app/bookingSubscription';
import type { Booking } from '../../src/types';

test('a joined read failure clears sensitive records, stops both sources, and cannot republish codes', () => {
  const rows: string[][] = [], errors: unknown[] = [], stopped: string[] = [];
  const group = subscriptionGroup<string[]>(value => rows.push(value), () => [], error => errors.push(error));
  group.add(() => stopped.push('orders'));
  group.add(() => stopped.push('codes'));
  group.publish(['private order', '1234']);
  const denied = new Error('permission-denied');
  group.fail(denied);
  group.publish(['late codes']); group.fail(new Error('late failure')); group.stop();
  assert.deepEqual(rows, [['private order', '1234'], []]);
  assert.deepEqual(stopped, ['orders', 'codes']);
  assert.deepEqual(errors, [denied]);
});

test('synchronous failure cleans subscriptions registered after failure without notifying after disposal', () => {
  let stopped = 0, errors = 0;
  const group = subscriptionGroup<number[]>(() => {}, () => [], () => { errors++; });
  group.fail(new Error('startup failure'));
  group.add(() => { stopped++; });
  group.stop(); group.fail(new Error('disposed'));
  assert.equal(stopped, 1); assert.equal(errors, 1);
});

test('workspace propagates terminal provider failure and retry creates a fresh independent subscription', () => {
  const received: Booking[][] = [], errors: unknown[] = [];
  let stopped = 0;
  let emit: (rows: Booking[]) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const listeners = {
    listenToBookings: () => () => {},
    listenToCustomerBookings: (_uid: string, next: typeof emit, error: typeof fail) => {
      emit = next; fail = error; return () => { stopped++; };
    },
    listenToDriverBookings: () => () => {},
    listenToMerchantBookings: () => () => {},
  };
  const start = () => subscribeWorkspaceBookings('customer', 'buyer', { role: 'customer' }, listeners, value => received.push(value), error => errors.push(error));
  const stop = start();
  const staleEmit = emit, staleFail = fail;
  const denied = new Error('revoked');
  fail(denied); stop();
  assert.equal(stopped, 1); assert.deepEqual(errors, [denied]);
  start();
  staleEmit([{ bookingId: 'old' }] as Booking[]); staleFail(new Error('late'));
  emit([{ bookingId: 'fresh' }] as Booking[]);
  assert.equal(received.at(-1)?.[0].bookingId, 'fresh');
  assert.equal(errors.length, 1);
});

test('synchronous listener setup errors are reported without leaving cached orders', () => {
  const rows: Booking[][] = [], errors: unknown[] = [];
  const failure = new Error('bad session');
  const listeners = {
    listenToBookings: () => { throw failure; },
    listenToCustomerBookings: () => () => {},
    listenToDriverBookings: () => () => {},
    listenToMerchantBookings: () => () => {},
  };
  subscribeWorkspaceBookings('customer', 'staff', { role: 'admin' }, listeners, value => rows.push(value), error => errors.push(error));
  assert.deepEqual(rows, [[], []]); assert.deepEqual(errors, [failure]);
});
