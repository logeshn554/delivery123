# Release readiness

Latest hosted verification (2026-10-19): [run 39244365802](https://github.com/logeshn554/delivery123/actions/runs/39244365802) passed all five jobs for `6375af156a654dbff0228971ace5f3ff36fcb87e`: checks (including 141 Firestore/integration tests), PostgreSQL/Auth lifecycle, and customer/merchant/driver Android debug build, identity and artifact checks. Debug artifacts expire 2026-10-26. These checks do not close signed-device, deployed-provider or operator acceptance gates.

The later merchant deletion guard source is verified by [run 39246004016](https://github.com/logeshn554/delivery123/actions/runs/39246004016), which passed the same five jobs, including all 142 Firestore/integration tests and all three Android debug identity matrices for commit `82bb87e`.

**Not ready for release.** Updated 2026-10-19. The latest staging preflight at `e79dcae` failed closed because operator gate-A evidence, staging/provider configuration, private evidence storage/scanner settings, project Functions configuration, and matching Android/iOS registrations are missing; see `BLOCKERS.md` for the exact missing categories.

The assigned TripBundle custody guard is on `main` in `818a988`; hosted run [39248895828](https://github.com/logeshn554/delivery123/actions/runs/39248895828) passed all workflow steps. Completed bundle deletion redaction is on `main` in `1e238dc`; hosted run [39251093565](https://github.com/logeshn554/delivery123/actions/runs/39251093565) is validating it. The local follow-up also anonymizes event IDs containing a deleted UID and passes the full emulator suite; its hosted run is pending. These source checks complement the bundle export in `3e0da8e`; they do not close owner-controlled staging, retention, or native acceptance gates.

Completed bundle deletion redaction now has source/emulator coverage: addresses, details, chats, OTPs, stale location data and UID-bearing event IDs are removed while financial/stage evidence remains, and driver cleanup preserves other participants' tracking and codes. Hosted validation of the latest follow-up is pending.

React 19/TypeScript/Vite and Capacitor Android/iOS targets already exist. No framework migration is needed for this increment. iOS native background driver-location source is now present, but the current Windows host has no Xcode toolchain and no iOS build/device acceptance has been performed. Android source/build presence also does not establish native provider functionality.

All master acceptance gates remain open: customer journeys, merchant/driver integration, deployed authorization, provider payments, consistent accessible UI, Android/iOS device journeys, external infrastructure, critical defect closure, and release documentation with operator-reviewed evidence.

Current verified source scope includes the complete six-service wallet/dispatch/custody emulator journeys, partner application/eligibility workflows, 116 Firestore/integration tests, application/unit tests, TypeScript, web build, secret scan and hosted run 39007835058 for fb569c3 (all five jobs passed, including account lifecycle and all three Android build/identity/artifact jobs). See TEST_RESULTS.md and the Android/account evidence documents for exact scope; these results do not establish authenticated native or real-provider acceptance.

The Android emulator cannot reach the configured development account endpoint. Native Firebase provider registrations and staging/production provider acceptance are absent. No iOS archive/device, live provider payment, signed release or deployed-rules acceptance is established. Functions and rules changes require coordinated staging deployment and verification before production rollout.

Account export now covers customer TripBundles and assigned driver legs/events with owner-scoped access and path-safe pagination. Account deletion also checks assigned active bundle legs independently of profile pointers. Both changes have emulator evidence; neither substitutes for production account-export, retention-policy or cross-store deletion acceptance.

The dispatch source now rotates offers across ordered booking pages, preserves fixed nonrenewing lease deadlines during driver polling, rejects stale no-response acceptance, and sends generic offer pushes to eligible drivers. Tracking route estimates request traffic-aware Maps durations while quote calculations remain traffic-unaware. Isolated tests cover request selection, no-response reoffer and fallback timing, but standard priority coordination, production-scale fairness, live Maps billing/quota, hosted CI for recent commits and native push delivery remain unverified.

Trip-bundle fallback now waits its configured separate-partner deadline for unassigned rides, preserves assigned ride drivers and rotates through collection-group pages. The emulator covers those code paths; deployed scheduler behavior and production-scale dispatch fairness remain unverified.

Run `node scripts/check-release.mjs --environment=staging`, then production when appropriate. Do not invent acceptance records to pass these gates. Keep the original independent service workflows, default-deny rules, provider verification and explicit unavailable states.

Saved-address source repair preserves validated delivery metadata and protects new migrations from checkpoint replay after canonical edits/deletions. This does not establish historical reconciliation, full migration coverage or deployed acceptance; those gates remain open.
Latest saved-address source 4070e06 passed hosted run 39001327488 checks (246 application tests, 112 Firestore/integration tests) and all seven real PostgreSQL/Auth lifecycle cases. Historical reconciliation and staging deployment remain unverified; these passes do not close release acceptance.

Hosted run 39006607511 passed for c08f3c7. Run 39007074131 had a transient customer Android dependency-resolution failure; all five jobs passed on the subsequent run 39007835058. Grocery source expiry guards are present and covered in the 116-test emulator suite. Functions are not deployed. Merchant, native device and live-provider acceptance remain open.

Account API-detected expiry now shares native cleanup with manual logout, and replacement login waits for teardown; 252 application tests and web build pass. This is controlled-runtime source verification. Actual native plugin behavior, proactive expiry detection, in-flight push refresh/enable races, offline reconciliation and persisted secure-storage failure remain release acceptance items.
All five hosted jobs passed for expiry-cleanup source 79b7281 in run 39002500312, including all three Android debug build/identity checks. Real-device expiry, broader authenticated journeys, historical migration reconciliation and provider/signing release acceptance remain open.

Push registration now checks session generation and Firebase identity across awaits, stores opt-in ownership by UID, and drains started token/registration work before cleanup. All 258 application tests and web build pass; controlled SDK bridges do not establish actual device/provider acceptance, restart behavior or bounded provider timing.
All five jobs passed for final push-registration source 57ebdd0 in hosted run 39003265614, including the SQL/Auth and three Android audience matrices. Controlled native/plugin race tests pass; actual device/provider acceptance, remote offline cleanup, process restart, and missing owner/policy release gates remain open.

Parcel photo evidence is not implemented. The former local-only driver picker was removed in fb569c3 because completion discarded the image. Do not accept delivery photos until a published policy, retention duration, customer booking consent, recipient consent capture, private-storage/scanning lifecycle, retrieval scope, deletion and support access are configured and tested.
