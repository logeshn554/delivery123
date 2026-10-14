# AllGo production implementation log — 2026-10-14

## Scope and repository state

Existing checkout: `delivery123`, origin `https://github.com/logeshn554/delivery123.git`.
Remote HEAD matched local base `f4c7505` when checked. Work branch:
`codex/allgo-production-foundations`. Extensive pre-existing uncommitted changes
were present; they are preserved and excluded from the scoped foundation commit.
This is an initial source audit, not a completed production certification.

REA MCP tools are available (including JavaScript analysis, browser capture and
artifact inspection). No third-party application artifact was supplied or analyzed.
No claim of reverse engineering Swiggy, Instamart or another application is made.

## Source inventory and findings

| Area | Evidence | Finding / remaining verification |
| --- | --- | --- |
| Entry/auth | `src/main.tsx`, `src/App.tsx`, `src/accounts.ts`, `server/accounts.mjs` | React/Vite client, Firebase and PostgreSQL account paths; current working App renders CustomerApp. Partner/admin entry routing needs explicit verification. |
| Customer services | `src/components/CustomerApp.tsx`, `src/features/discovery/ServiceDirectory.tsx` | Food, grocery, parcel, ride, driver hire and vehicle transport entry points exist. Goods transport and movers remain planned; inter-city acceptance is unverified. |
| Merchant/driver/admin | `MerchantPortal.tsx`, `DriverApp.tsx`, `AdminDashboard.tsx` under `src/components` | Existing modules must be reused. Workspace sibling merchant/delivery folders also exist; do not duplicate them or assume they are published in this repository. |
| Shared UI | `src/design-system/{tokens,mobile,stitch}.css`, `CatalogState.tsx`, `StatusPanel.tsx`, `BottomNavigation.tsx` | Later Stitch CSS replaced root tokens. Existing local token additions already address several missing values reported by UI_PROGRESS.md. Broader consolidation remains unfinished. |
| Data/authz | `src/data/firestoreHelper.ts`, `src/data/firebaseHelper.ts`, `firestore.rules`, `storage.rules` | Shared callable service adapter, account/session checks and default-deny rules exist. Emulator/integration validation remains required. |
| Backend | `functions/index.js` and domain policy modules | Existing quote, payment, COD, dispatch, fulfillment, payout, cancellation and refund operations; unit tests do not prove deployed integration. |
| Payments/maps | `src/payments.ts`, `functions/maps.js`, payment/tracking callables | Razorpay web/native checkout and server operations exist. Real provider callbacks, refunds and route/privacy behavior have not been exercised this run. |
| Native/release | `capacitor.config.json`, `scripts/check-release.mjs` | Android/iOS Capacitor targets configured; production gate fails for missing configuration, native Firebase registrations and operator acceptance. No signed release built. |

## Implemented

- TASK-02: extended the shared type scale with display, headline, subtitle,
  callout and tiny sizes; added line-height and weight tokens; applied the tokens
  to common authentication, mobile heading and status styles. The shared
  phone/browser input size stays 16px to avoid iOS focus zoom.
- `src/design-system/stitch.css`: removed competing global brand, strong-brand,
  canvas and border definitions. Welcome wordmark/buttons and cart shadows now
  consume the shared tokens. Existing layout and service-specific styles retained.
- `src/design-system/CatalogState.tsx`: loading exposes busy state; empty and
  no-results outcomes expose a status announcement; failures remain alerts.
- `server/mobileFoundations.test.mjs`: regression coverage for all four catalog
  states, descriptive content and the retry action.
- Local integration repairs, **not included in the standalone commit**:
  `src/components/CustomerApp.tsx` wallet checkbox now updates the existing
  `paymentMethodChoice` state (`wallet` / `online`); removed the redundant second
  `updateMerchantCatalog` export in `src/data/firebaseHelper.ts`, retaining the
  existing callable implementation. These repair pre-existing pending work.

## Verification

- Baseline `npm test`: passed (Functions, UI, server and secret scan).
- Baseline `npm run lint`: failed on removed wallet setter and duplicate catalog
  implementation; after local repairs, TypeScript completed without diagnostics.
- `npm run build`: passed in development mode; large-chunk warning remains.
- Targeted foundation/navigation/Stitch tests: **12 passed, 0 failed**.
- TASK-02 `npm run lint`: passed.
- TASK-02 `npm test`: **113 passed, 0 failed** across Functions, UI, server and
  secret-scan checks.
- Production configuration check: **blocked**, as expected; no bypass added.
- Browser preview: attempted, but localhost access timed out; shell HTTP access
  reported socket permission denial. Responsive visual and native keyboard/safe-area
  QA are **not verified** by this run.
- Repository-wide diff whitespace check reports existing issues in pending files;
  scoped staged changes are checked separately before commit.

## Checklist and continuation order

- [x] Inspect origin/base state and preserve existing work.
- [x] Identify source modules, discover REA and run baseline checks.
- [x] Fix competing global theme overrides and catalog announcements.
- [x] Add the shared typography size, line-height and weight scale.
- [x] Repair the two local TypeScript blockers.
- [ ] Complete design-system consolidation and 360/390/430px visual QA.
- [ ] Verify customer/merchant/driver/admin entry routing and auth/OTP end to end.
- [ ] Validate food, then grocery, then parcel, then rides/transport workflows.
- [ ] Validate merchant, driver and admin operational workflows.
- [ ] Verify payment/webhook/refund idempotency, maps, dispatch and location privacy
  with configured non-production services and security-rule emulators.
- [ ] Supply production configuration and acceptance evidence; build and test
  signed Android/iOS releases on devices before claiming readiness.

Next work must start with the current working tree and this log. Do not reset it,
bulk-stage it or mark UI_PROGRESS tasks complete based on source presence alone.
The initial commit is deliberately independent of pending account and role changes.
