# Release readiness

**Not ready for release.** Updated 2026-10-17.

React 19/TypeScript/Vite and Capacitor Android/iOS targets already exist. No framework migration is needed for this increment. Android source/build presence does not establish native provider functionality; iOS has not been tested on this Windows host.

All master acceptance gates remain open: customer journeys, merchant/driver integration, deployed authorization, provider payments, consistent accessible UI, Android/iOS device journeys, external infrastructure, critical defect closure, and release documentation with operator-reviewed evidence.

Current verified scope: TypeScript, 243 local application tests, subscription/session lifecycle regressions, complete six-service backend wallet journeys and authorization/integration checks in isolated Firestore. The latest backend suite passed 111 tests, including the repaired missing-claim bypass for Neon-linked identities. Hosted run 38998276443 for 1223ebe passed application checks plus all three Android build/packaged-identity/artifact jobs. All three local apps installed/launched on a recovered emulator; public partner recovery/welcome and customer recovery were inspected. The later exact-origin Firebase CSP fix was rebuilt and checked on the customer app. Hosted run 39000324482 for 0850bd9 passed all six real PostgreSQL/Auth/Firestore account lifecycle tests without skips. See TEST_RESULTS.md and the Android/account evidence documents for exact scope; these results do not establish authenticated native or real-provider acceptance.

The Android emulator cannot reach the configured development account endpoint. Native Firebase provider registrations and staging/production provider acceptance are absent. No iOS archive/device, live provider payment, signed release or deployed-rules acceptance is established. Functions and rules changes require coordinated staging deployment and verification before production rollout.

Run `node scripts/check-release.mjs --environment=staging`, then production when appropriate. Do not invent acceptance records to pass these gates. Keep the original independent service workflows, default-deny rules, provider verification and explicit unavailable states.

Saved-address source repair preserves validated delivery metadata and protects new migrations from checkpoint replay after canonical edits/deletions. This does not establish historical reconciliation, full migration coverage or deployed acceptance; those gates remain open.
Latest saved-address source 4070e06 passed hosted run 39001327488 checks (246 application tests, 112 Firestore/integration tests) and all seven real PostgreSQL/Auth lifecycle cases. Historical reconciliation and staging deployment remain unverified; these passes do not close release acceptance.
