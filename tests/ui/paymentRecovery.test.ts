import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../src/components/PaymentRecoveryPanel.tsx", import.meta.url), "utf8");

test("payment recovery panel exposes a refresh action and activity list", () => {
  assert.match(src, /Refresh/);
  assert.match(src, /listPaymentActivity/);
  assert.match(src, /Loading your payment records/);
});

test("payment recovery shows recoverable status actions for unresolved payments", () => {
  assert.match(src, /Check payment status/);
  assert.match(src, /reconciliation_required/);
  assert.match(src, /provider_created/);
});

test("payment recovery navigates to confirmed order and offers support", () => {
  assert.match(src, /onOrder\(attempt\.bookingId/);
  assert.match(src, /Get payment help/);
  assert.match(src, /onSupport/);
});

test("payment recovery panel discloses stale-debit guidance", () => {
  assert.match(src, /bank shows a pending debit/);
  assert.match(src, /before paying again/);
});
