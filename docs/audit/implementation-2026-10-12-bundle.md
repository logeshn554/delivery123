# Implementation Progress — 2026-10-12: One Unified Trip Bundle

## 1. Feature Summary
Implemented the **ONE UNIFIED TRIP BUNDLE** feature end-to-end across the AllGo platform (`delivery123`). This enables customers to combine ride, restaurant food, and supermarket grocery orders into a single booking flow, single quote, single checkout, single payment attempt, and live synchronized tracking screen.

Fulfillment uses a unified model driven strictly by operator configuration in Firestore (`platform_config/bundle_fulfillment_policy`), assigning the assigned ride driver to make an en-route detour stop to pick up food or grocery orders when within configured time and distance bounds, with automatic fallback to separate delivery partners when detours exceed limits or drivers are unavailable.

---

## 2. Actual Verification Results & Test Counts

All tests were executed against real code and the official Google Cloud Firestore emulator (`cloud-firestore-emulator-v1.22.0.jar`). Zero fabricated results, mock statistics, or simulated successes.

| Suite | Real Command | Exit Code | Tests Passed | Tests Failed | Details |
|---|---|---|---|---|---|
| Functions Policy Unit Tests | `npm --prefix functions test` | **0** | **58** | 0 | Covers `bundlePolicy`, `bundleFulfillmentPolicy`, `codPolicy`, `perLegRefundPolicy`, `bookingPolicy`, `cartPolicy`, `merchantPolicy`, `journalPolicy`, etc. |
| Account / Server Tests | `node --import tsx --test server/*.test.mjs` | **0** | **12** | 0 | Covers session security, account linking, CSP, cursors, export scopes. |
| Firestore Rules & Integration Tests | `npm run test:rules` | **0** | **89** | 0 | Covers isolated Firestore emulator rules, `bundle.integration.test.mjs` (10 tests), `payments.integration.test.mjs`, `partner-evidence.integration.test.mjs`, and security rules. |
| Static TypeScript Lint | `npm run lint` (`tsc --noEmit`) | **0** | — | 0 errors | Full strict TypeScript compilation check across all application screens and components. |
| Vite Production Web Build | `npm run build` | **0** | — | 0 errors | Built all client assets (2,355 modules transformed into production chunks). |
| Secret Scan | `node scripts/check-secrets.mjs --working-tree` | **0** | — | 0 leaks | 300 snapshots inspected. Zero recognized secrets or database credentials found. |

### Total Passing Tests: **159 automated tests** (58 Functions + 12 Server + 89 Emulator & Rules).

---

## 3. Detailed Component Implementations

### Phase A — Data Model & Migration
- **Types Added (`src/types.ts`)**: `TripBundle`, `BundleLeg`, `BundleLegBreakdown`, `LegType`, `BundleStatus`, `FulfillmentMethod`, `PaymentMethod`. Optional `bundleId` and `legId` added to `Booking`.
- **Policy Modules (`functions/`)**:
  - `bundlePolicy.js`: Implements `deriveBundleStatus()` covering all leg status combinations (pending, active, completed, cancelled, mixed) with 25 unit test cases.
  - `bundleFulfillmentPolicy.js`: Implements `decideLegFulfillment()` evaluating detour distances and travel times against `platform_config/bundle_fulfillment_policy`. Fails closed if config is missing.
  - `codPolicy.js`: Implements `isCodEligible()` and `assertCodAllowed()` querying `subscriptions/{uid}`.
  - `perLegRefundPolicy.js`: Implements `computeLegRefund()`, `getLegRefundIdempotencyKey()`, and `buildLegRefundJournal()`.
- **Firestore Security Rules (`firestore.rules`)**:
  - Default-deny rules for `bundles/`, `legs/`, `bundle_tracking/`, `bundle_codes/`, and `subscriptions/`.
  - Customer ownership access control.
  - Cross-leg isolation: Drivers can only read their assigned leg; sibling leg private context (customer phone, pickup OTPs) is denied.
  - Root bundle creation restricted to trusted server callables.
- **Composite Indexes (`firestore.indexes.json`)**: Added required composite query indexes for `legs`, `bundles`, and `subscriptions`.
- **Legacy Migration (`migrateLegacyBookingToBundle`)**: Admin callable with dry-run mode (`dryRun: true`) converting legacy single-service `bookings/` into 1-leg bundles idempotently.
- **Fare Refactor (`functions/index.js`)**: Refactored `priceAndPrepareBooking` into a shared, robust `priceLeg()` function. Preserved existing callable names and behaviors.

### Phase B — Server Policy
- `deriveBundleStatus()` correctly calculates bundle state from arbitrary child leg combinations.
- `onLegStatusChange` Firestore trigger syncs parent bundle status on any leg write.
- `reevaluateBundleFulfillment` scheduled function (every 5 minutes) monitors legs at risk of missed deadlines and re-evaluates driver assignment.
- Operator config failure mode: Missing or disabled `platform_config/bundle_fulfillment_policy` immediately fails closed with a clear, user-facing error message.

### Phase C — Payment & Refund
- `getBundleQuote`: Prices all legs via `priceLeg`, evaluates detour fulfillment, applies bundle-level coupons, and gates COD eligibility server-side via `subscriptions/{uid}`. Locks quote for 5 minutes.
- `createBundlePaymentOrder`: Enforces quote lock and server-side COD check. Creates Razorpay order or deterministic `COD_{uuid}` payment attempt.
- `confirmBundleCheckout`: Atomically validates signature / re-checks COD subscription in a Firestore transaction. Validates inventory and decrements stock for grocery legs, creates parent `bundles/` document, child `legs/`, `bundle_codes/`, and balanced capture journals.
- `cancelBundleLeg`: Idempotent per-leg partial Razorpay refund using key `${paymentId}:leg:${legId}` and journal `financial_journals/leg_refund_{legId}`. Restores grocery stock using `recordStockMovement(..., 'return', ...)` without affecting sibling legs.
- `journalPolicy.js`: Extended with bundle references; verified ledger balances to zero at terminal states.

### Phase D — Dispatch & Fulfillment
- `listBundleLegOffers`: Surfaces available leg offers to drivers filtered by vehicle type, service capabilities, and proximity. Strips customer phone numbers, pickup OTPs, and sibling leg context.
- `acceptBundleLegOffer`: Transactionally leases leg to driver.
- `advanceBundleLegDriver`: Handles leg status transitions (`accepted` → `preparing` → `ready` → `arrived` → `at_merchant_stop` → `transit` → `delivered` / `completed`).
- `confirmDetourPickup`: Validates merchant handover OTP (`bundle_codes/{bundleId}.legs.{legId}.pickupCode`) before advancing a detour leg to `transit`.
- `updateDriverLocation`: Aggregates driver GPS coordinates into `bundle_tracking/{bundleId}`.

### Phase E — Customer UX
- `TripBundleScreen.tsx`: Complete multi-stop trip builder. Customers select a primary ride, add food and grocery stops along route, review per-leg breakdowns, ETAs, and fulfillment methods, view COD availability badge, and pay via unified Razorpay checkout.
- `BundleTrackingScreen.tsx`: Unified live-tracking view featuring live multi-vehicle map visualizer, accordion leg cards with live status badges, individual leg chat, and independent per-leg cancellation.
- All modal dialogs and confirmations use `useFeedbackDialog` with zero `window.alert()` or `window.confirm()` calls.

---

## 4. External Acceptance Checklist (Pending Live Verification)

In strict accordance with the engineering requirements, the code is complete and verified in the local emulator environment. However, live hardware, live cloud credentials, and external third-party provider accounts require manual acceptance in staging and production.

The following 10 external acceptance items are reported as **PENDING**:

- [ ] **EXT-B-01**: Razorpay multi-leg checkout with real test card/UPI credentials on live Razorpay dashboard.
- [ ] **EXT-B-02**: Live driver GPS detour route calculation with live Google Maps Routes API key and traffic-aware routing.
- [ ] **EXT-B-03**: Physical device multi-stop trip navigation testing on physical Android and iOS hardware.
- [ ] **EXT-B-04**: Merchant physical pickup OTP handover verification between physical restaurant/store and driver app.
- [ ] **EXT-B-05**: Real-world driver rejection and automatic separate partner dispatch reassignment during active transit.
- [ ] **EXT-B-06**: Operator configuration updates via live Firestore console (`platform_config/bundle_limits`, `bundle_fulfillment_policy`).
- [ ] **EXT-B-07**: Razorpay partial refund execution for cancelled legs verified in live Razorpay merchant dashboard.
- [ ] **EXT-B-08**: High-concurrency grocery stock decrement with real device simultaneous checkouts.
- [ ] **EXT-B-09**: Push notifications to customer and multiple drivers during multi-leg state transitions.
- [ ] **EXT-B-10**: Live AllGo Plus subscription lifecycle with physical cash on delivery capture.
