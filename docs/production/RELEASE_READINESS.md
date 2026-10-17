# Release readiness

**Not ready for release.** Updated 2026-10-17.

React 19/TypeScript/Vite and Capacitor Android/iOS targets already exist. No framework migration is needed for this increment. Android source/build presence does not establish native provider functionality; iOS has not been tested on this Windows host.

All master acceptance gates remain open: customer journeys, merchant/driver integration, deployed authorization, provider payments, consistent accessible UI, Android/iOS device journeys, external infrastructure, critical defect closure, and release documentation with operator-reviewed evidence.

Current verified scope: TypeScript, 243 local application tests, subscription/session lifecycle regressions, complete six-service backend wallet journeys and authorization/integration checks in isolated Firestore. The latest backend suite passed 111 tests, including the repaired missing-claim bypass for Neon-linked identities. Hosted run 38998276443 for 1223ebe passed application checks plus all three Android build/packaged-identity/artifact jobs. All three local apps installed/launched on a recovered emulator; public partner recovery/welcome and customer recovery were inspected. The later exact-origin Firebase CSP fix was rebuilt and checked on the customer app. Hosted run 39000324482 for 0850bd9 passed all six real PostgreSQL/Auth/Firestore account lifecycle tests without skips. See TEST_RESULTS.md and the Android/account evidence documents for exact scope; these results do not establish authenticated native or real-provider acceptance.

The Android emulator cannot reach the configured development account endpoint. Native Firebase provider registrations and staging/production provider acceptance are absent. No iOS archive/device, live provider payment, signed release or deployed-rules acceptance is established. Functions and rules changes require coordinated staging deployment and verification before production rollout.

Run `node scripts/check-release.mjs --environment=staging`, then production when appropriate. Do not invent acceptance records to pass these gates. Keep the original independent service workflows, default-deny rules, provider verification and explicit unavailable states.

Saved-address source repair preserves validated delivery metadata and protects new migrations from checkpoint replay after canonical edits/deletions. This does not establish historical reconciliation, full migration coverage or deployed acceptance; those gates remain open.
Latest saved-address source 4070e06 passed hosted run 39001327488 checks (246 application tests, 112 Firestore/integration tests) and all seven real PostgreSQL/Auth lifecycle cases. Historical reconciliation and staging deployment remain unverified; these passes do not close release acceptance.

Hosted run 39006607511 for c08f3c7 passed checks, account integration and all three Android debug build/identity/artifact jobs. Grocery source passes 263 application tests, TypeScript, web build, secret scan and 116 isolated Firestore integration/rules tests, including scheduled expiry release. A subsequent local race guard rejects late customer choices before cleanup runs; that final guard is awaiting hosted CI. Functions are not deployed. Merchant, native device and live-provider acceptance remain open.

Account API-detected expiry now shares native cleanup with manual logout, and replacement login waits for teardown; 252 application tests and web build pass. This is controlled-runtime source verification. Actual native plugin behavior, proactive expiry detection, in-flight push refresh/enable races, offline reconciliation and persisted secure-storage failure remain release acceptance items.
All five hosted jobs passed for expiry-cleanup source 79b7281 in run 39002500312, including all three Android debug build/identity checks. Real-device expiry, broader authenticated journeys, historical migration reconciliation and provider/signing release acceptance remain open.

Push registration now checks session generation and Firebase identity across awaits, stores opt-in ownership by UID, and drains started token/registration work before cleanup. All 258 application tests and web build pass; controlled SDK bridges do not establish actual device/provider acceptance, restart behavior or bounded provider timing.
All five jobs passed for final push-registration source 57ebdd0 in hosted run 39003265614, including the SQL/Auth and three Android audience matrices. Controlled native/plugin race tests pass; actual device/provider acceptance, remote offline cleanup, process restart, and missing owner/policy release gates remain open.
