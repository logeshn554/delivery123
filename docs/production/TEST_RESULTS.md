# Test results

FIX-06 (2026-10-17): TypeScript, 226 application tests (67 Functions, 65 UI, 94 server), secret scan and development web build pass. Evidence: .cache/session-invalidation-tests-2026-10-17.log and .cache/session-invalidation-build-2026-10-17.log. New regressions cover secure removal/auth failures, stale logout publication, pending secure reads/saves, serialized removal and account requests held across logout. Controlled native bridge dependencies execute the production TS modules. No connected emulator/provider or app-restart acceptance is claimed; backend source is unchanged.

FIX-05 (2026-10-17): TypeScript and all 217 application tests pass (67 Functions, 56 UI, 94 server); secret scan passes. Development web build passes with the existing chunk-size warning (.cache/logout-cleanup-build-2026-10-17.log). Test evidence: .cache/logout-cleanup-tests-2026-10-17.log. Three logout regressions verify credential cleanup ordering, continuing after offline/plugin failures and preserving primary logout errors. Native/provider behavior is not accepted: adb currently reports no devices/emulators. No backend/rules changes were made; the earlier emulator suite covers the unchanged server source.

PARTNER-01 (2026-10-16): TypeScript passes; 214 application tests pass (67 Functions, 53 UI, 94 server), secret scan passes. Log: .cache/partner-variants-tests.log. A legacy welcome navigation source assertion was updated for partner signup/customer onboarding. Corrected Android flavor builds pass for merchant, driver and customer (.cache/{merchant,driver,customer}-flavor-build.log). Merged manifests verify distinct package IDs and preserved debug cleartext configuration; only driver declares DriverLocationService and allgo-delivery scheme. All three rebuilt APK installations report Success and package listing shows in.allgo.app, in.allgo.merchant and in.allgo.delivery. Merchant launch returned activity-not-found; subsequent resolver queries failed with broken pipe and missing package/activity services. Boot property remained 1, zygote running, but service check package reported not found. Startup acceptance remains unverified pending emulator recovery. Authenticated provider and native GPS acceptance remain unverified.

## 2026-10-16 current execution

| Check | Result | Scope / limitation |
|---|---|---|
| Baseline npm run lint | Passed | TypeScript only |
| Baseline npm test | Passed | Functions, UI, server and working-tree secret scan; no deployed provider acceptance |
| Booking subscription regression tests | 4 passed | Admin across audiences, personal customer scope, assigned partner scope, cleanup/late callbacks |
| Post-change npm run lint | Passed | Current source compiles |
| npm run test:rules | 96 passed | Isolated Firestore demo project; provider integrations mocked |
| ADB devices/package/launch | Passed | Emulator-5554; in.swiggy.android; LoginActivityV2 resumed |
| Reference screen capture | Partial | REA captured coverage-empty home and location selector; remaining journeys unobserved |
| Android debug assembly | Passed | 306 tasks; BUILD SUCCESSFUL; .cache/android-build-2026-10-16.log; native provider registration still absent |
| Android install and launch | Passed | adb install -r succeeded on emulator-5554; startup screenshot inspection pending |
| iOS build/device | Blocked | Windows execution host lacks supported Xcode environment |

Store reference captures only in ignored `.cache/reference-analysis/`. Do not commit APKs or proprietary reference images.

Post-change npm test: 207 passed (67 Functions, 46 UI, 94 server), secret scan passed. Development build passed with existing 603.73 kB accounts chunk warning. git diff --check passed. Staging preflight failed closed on missing configuration, native registrations and operator acceptance. Firestore first attempt failed on sandbox loopback permissions; elevated isolated rerun passed.

FIX-02: 211 tests passed (67 Functions, 50 UI, 94 server), secret scan passed; TypeScript and development build passed. No rules were modified, so the earlier 96-test rules run remains applicable. Native sync and Android assembly succeeded. The interrupted initial build handle disappeared; a logged incremental rerun confirmed success. The sandbox attempt failed loading Gradle native services; elevated run passed.

Complete food/grocery backend journeys and existing suite: 98 passed, 0 failed, 0 skipped; log .cache/journey-rules-2026-10-16.log. Maps mocked, wallet test funds seeded only in demo emulator. Android startup capture .cache/android-qa/startup-2026-10-16/screen.png: recovery screen correctly exposes retry and sign-in options; authenticated journey not accepted.

FIX-03 final: 100 emulator/integration tests passed, 0 failed/skipped (.cache/driver-revocation-final-2026-10-16.log); 211 application tests and secret scan passed (.cache/production-tests-2026-10-16-security-final.log); TypeScript and git diff --check passed. Negative regression first failed with Missing expected rejection (.cache/driver-revocation-before-2026-10-16.log), then passed after authorization repair. Changes are local source/emulator verified and require staging Functions/rules deployment.

FIX-04: first complete six-service run failed ride/takeover/transport quote persistence on undefined fareBreakdown (.cache/six-service-journeys-2026-10-16.log). After conditional field omission, all 104 emulator/integration tests passed, 0 failed/skipped (.cache/six-service-journeys-fixed-2026-10-16.log). Application suite: 211 passed and secret scan passed (.cache/production-tests-2026-10-16-quotes.log). Syntax and whitespace checks passed. External Maps responses simulated; no real payment/order/provider transaction performed.
