# Test results

## 2026-10-19 hosted main verification

[Application checks run 39244365802](https://github.com/logeshn554/delivery123/actions/runs/39244365802), attempt 1, passed all five jobs for `6375af156a654dbff0228971ace5f3ff36fcb87e`: checks (lint, application tests, 141 Firestore/integration tests, web build, fixture scan and dependency audit), PostgreSQL/Auth lifecycle, and all three Android debug build/identity/artifact jobs. Results were read directly from the GitHub run jobs API.

Unexpired artifacts observed, each including its debug APK and verification JSON:

| Audience | Artifact ID | Expires (UTC) |
|---|---|---|
| Merchant | 12183815366 | 2026-10-26 11:28:59 |
| Customer | 12183080927 | 2026-10-26 11:29:12 |
| Driver | 12182583371 | 2026-10-26 11:29:17 |

This establishes hosted isolated-service and Android debug packaging checks for the stated source commit. It does not prove signed release, authenticated device journeys, iOS compilation or deployed provider acceptance.

## 2026-10-19 hosted merchant deletion guard verification

[Application checks run 39246004016](https://github.com/logeshn554/delivery123/actions/runs/39246004016), attempt 1, passed all five jobs for `82bb87e4b6a070d1f5ee3b455caad752cf26c354`: lint, application tests, Firestore rules/integration (142 tests), web build, fixture/dependency checks, PostgreSQL/Auth integration, and customer/merchant/driver Android debug builds plus packaged identity checks.

| Audience | Artifact ID | Expires (UTC) |
|---|---|---|
| Customer | 12183144163 | 2026-10-26 11:42:45 |
| Driver | 12183387528 | 2026-10-26 11:42:48 |
| Merchant | 12183743360 | 2026-10-26 11:42:50 |

Hosted checks do not prove signed builds, authenticated device journeys, iOS compilation, deployed indexes or real provider acceptance.

## 2026-10-18 delayed driver availability alerts

- `notifyDriverAvailability` now rechecks the current driver profile before searching and sending, including verified status, online state, location consent, no active assignment and a fresh position within the existing 60-second/100-metre policy. A delayed/retried event after the driver goes offline is suppressed.
- `npm run test:rules`: **133 passed, 0 failed, 0 skipped** (132.4s). The existing driver-availability emulator test now models state changes between events and verifies stale offline replay sends no push. `npm test` passed (71 Functions, 95 UI, 98 server; secret scan 746 snapshots); TypeScript, web build and `node --check` passed. The build retains its existing large-chunk advisory.
- Firebase Messaging is stubbed in tests. Native provider delivery, retry timing and killed-app behavior remain unverified.

## 2026-10-18 stage-aware incident choices

- `BookingExceptionPanel` now offers failed-pickup only for `accepted`/`preparing`/`ready` bookings and failed-delivery only for `transit`; merchant-unavailable remains food/grocery-only. The selection resets if a live booking changes stage.
- `npm test` passed: Functions **71**, UI **95**, server **98**, secret scan **746 snapshots**. `npm run lint` and `npm run build` passed; the existing >500 KB chunk advisory remains. Focused UI suite passed 95/95.
- UI filtering improves feedback but does not replace server-side stage, role or assignment checks.

DISPATCH-01/NOTIFY-01 later-driver alert increment (2026-10-18, code commit 4b9d354): `npm --prefix functions test` passes 67/67 policy/unit tests. `npm run test:rules` passes 127/127 isolated Firestore integration and authorization tests, including newly available driver alert eligibility, expired-driver suppression, stale-to-fresh location activation, suppression on ordinary fresh position refresh, paginated alert discovery beyond 100 ineligible bookings, and no booking/customer fields in the alert payload. `node --check functions/bookingNotifications.js`, Firestore index JSON parsing and `git diff --check` pass. Firebase Messaging is stubbed; delivery, background/killed-app behavior and notification taps still need native provider/device acceptance. No production deployment or real notification was performed. GitHub returned no combined status checks or workflow run for `4b9d354` at lookup time.

GROC-01 substitution/expiry increment (2026-10-17): `npm test` passes 263 application tests (67 Functions, 98 UI, 98 server), TypeScript, web build and secret scan. The isolated Firestore emulator suite passes 116 tests, including replacement reservation, stale-price rejection, wallet debit/refund journals, decline release, scheduled 15-minute expiry/release and stale-decision rejection, and customer/store push. Hosted run [39006607511](https://github.com/logeshn554/delivery123/actions/runs/39006607511) for c08f3c7 succeeded across application checks, account integration and all three Android build/identity/artifact jobs. A final local regression now also proves response is rejected after deadline even before scheduled cleanup; that follow-up awaits hosted verification. Real merchant/device acceptance remains open. No production/staging data was changed.

AUTH-LOCAL-01 hosted result (2026-10-17): [run 39000324482](https://github.com/logeshn554/delivery123/actions/runs/39000324482), account job 117301999453, source 0850bd9: 6 passed, 0 failed/cancelled/skipped; emulator script exited 0. The actual SQL/API/Auth/Firestore paths and previously issued client credentials were exercised. The main application check and all three Android jobs passed too; retained customer/merchant/delivery artifacts were observed. See ACCOUNT_INTEGRATION_EVIDENCE_2026-10-17.md for individual assertions and isolation. This supersedes the earlier pending result, without establishing real Neon/SMS or authenticated native acceptance.

AUTH-LOCAL-01 initial (2026-10-17): all 243 application tests pass (67 Functions, 81 UI, 95 server; .cache/account-integration-unit-tests-2026-10-17.log). TypeScript passes with GOMAXPROCS=4 (.cache/account-integration-lint-2026-10-17.log), including correction of implicit callback types. Database/emulator guard and legacy-checker refusal tests pass; runner/test syntax, YAML service parse and secret/whitespace checks pass. The first unrestricted compiler attempt exhausted Windows commit memory while the task's emulator was running; emulator shutdown/limited compiler parallelism resolved it. The six real PostgreSQL/Auth/Firestore lifecycle tests have not run locally because PostgreSQL is unavailable; the new disposable CI job must supply that evidence before this integration scope is accepted.

FIX-07 (2026-10-17): pre-fix isolated suite reproduced two missing-claim bypasses (109 passed, 2 failed, .cache/account-bridge-bypass-before-2026-10-17.log). After enforcing bridge requirements for Neon-linked identities and updating the older legitimate-profile-update fixture to include its live session, all 111 tests pass, 0 failed/skipped (.cache/account-bridge-bypass-final-2026-10-17.log). Positive live-session access and negative missing/revoked-session access are covered. The intermediate run's sole failure was the prior fixture's unsupported unbridged name update; mapping-change denial remains tested with valid authorization. No production deployment was performed.

CI-01/MOBILE-01/CSP-01 (2026-10-17): hosted https://github.com/logeshn554/delivery123/actions/runs/38998276443 passed checks and Android customer/merchant/driver jobs; all three debug artifacts were observed. Recovered emulator installed/launched all three apps; public partner recovery/welcome and customer recovery were inspected. Firebase bootstrap CSP denial was reproduced in merchant/delivery logs; exact-origin fix passes 240 application tests (67 Functions, 78 UI, 95 server), TypeScript and secret scan (.cache/firebase-csp-tests-2026-10-17.log). Customer APK rebuild/identity check passes (.cache/firebase-csp-android-2026-10-17.log), installation/launch succeeds and initialized process 11864 has zero CSP violation matches. See ANDROID_CI_EVIDENCE_2026-10-17.md for capture hashes/artifact IDs. The hosted green result precedes this CSP change; it does not establish provider login, authenticated jobs or signed release acceptance.

CI-01 follow-up (2026-10-17): all 239 application tests (67 Functions, 78 UI, 94 server), TypeScript and secret scan pass (.cache/app-artifact-final-tests-2026-10-17.log). Three fresh local Android builds pass with actual APK manifest/embedded-metadata verification and SHA-256 evidence. Clean-checkout preparation tests reproduce the formerly hidden dependency on the other platform and verify explicit Android/iOS isolation plus rejection of an unsynced target. First hosted matrix run https://github.com/logeshn554/delivery123/actions/runs/38998035791 passed application checks and failed Android preparation on missing ios/App/App/capacitor.config.json; the fix awaits hosted rerun. Current local artifact hashes reside in ignored .cache/apps/<audience>/verification.json. Runtime/provider/signing acceptance remains separate.

CI-01 initial (2026-10-17): 236 application tests (67 Functions, 75 UI, 94 server), TypeScript, secret scan, YAML parse and whitespace checks pass. Evidence: .cache/app-artifact-tests-2026-10-17.log. Packaged-identity policy checks pass against the existing three debug APKs; negative cases reject mismatched native IDs, customer packages carrying the driver service, missing URL scheme, demo and mismatched metadata. Current-source native build/check logs are .cache/ci-{customer,merchant,driver}-android-2026-10-17.log and remain pending at this commit. Hosted CI result for the added matrix must be observed after push. Baseline ad078f3 application checks passed at https://github.com/logeshn554/delivery123/actions/runs/38997673637; that earlier run did not include the new native matrix.

NOTIFY-01 tap routing (2026-10-17): all 233 application tests (67 Functions, 72 UI, 94 server), TypeScript, secret scan and merchant/driver web builds pass. Evidence: .cache/partner-tap-tests-2026-10-17.log and .cache/{merchant,driver}-tap-build-2026-10-17.log. New resolver/render tests cover malformed IDs, missing/reassigned driver bookings, merchant business/catalog isolation, terminal status and generic waiting/unavailable content. Feed timing, focus/scroll and native cold/warm notification taps still require browser/device interaction acceptance. Server/rules source is unchanged; the previous 109-test emulator result remains the latest backend evidence.

MERCHFIN-01 (2026-10-17): TypeScript, all 228 application tests (67 Functions, 67 UI, 94 server), secret scan and merchant web build pass. Logs: .cache/merchant-settlement-integrity-2026-10-17.log and .cache/merchant-settlement-build-2026-10-17.log. Rendered settlement tests verify assigned-business/completed-order scope, accurate booking-value labels, empty/invalid-value states and absence of transfer actions or fabricated bank/fee claims. Source search confirms the merchant portal no longer contains local payout storage, random references, fixed bank details, withdrawal modal or commission calculation. No financial backend was added; real merchant payouts and native acceptance remain unverified/unimplemented.

NOTIFY-01 (2026-10-17): 109 Firestore/integration tests pass, 0 failed/skipped (.cache/partner-push-emulator-final-2026-10-17.log). Real handlers and isolated Firestore cover food/grocery recipient routing, app audience exclusion, partner registration eligibility, current assignment after delayed events, revoked merchant/driver access, preference opt-out, legacy/expired/malformed registrations, ownership-scoped token removal, permanent token cleanup and transient retry. Firebase Messaging is stubbed; no real notifications were sent. All 226 application tests, TypeScript, syntax/whitespace checks and secret scan pass. Customer, merchant and driver web builds pass (.cache/{customer,merchant,driver}-push-build-2026-10-17.log). Native push registration/delivery, token refresh, background/killed-app behavior and tap routing still require configured providers and a healthy device.

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

2026-10-17 saved-address increment: TypeScript and all 246 application tests passed (67 Functions, 81 UI, 98 server). New tests cover exact optional delivery metadata, trimming and field limits, malformed legacy metadata classification and omission of arbitrary fields. Logs: .cache/address-lint.log and .cache/address-tests.log (ignored). Expanded real SQL/Auth integration coverage and receipt rules tests require fresh evidence; prior hosted source evidence does not validate this change.
Local isolated Firestore/integration verification passed all 112 tests, zero failures/skips, including migration receipt read/write/delete denial for the owner, another user and operations client. Log: .cache/address-rules.log. The expanded SQL/Auth suite has seven cases; hosted execution is pending at this commit.
Hosted run 39001327488 for source 4070e06 passed checks and the expanded real PostgreSQL/Auth/Firestore account job 117305078570: seven tests, zero failures/cancellations/skips, script exit 0. New metadata import, checkpoint retry after actual client edit/deletion, preexisting canonical preservation and malformed legacy classification all passed. See ACCOUNT_INTEGRATION_EVIDENCE_2026-10-17.md. No production data, provider SMS/payment or native authenticated journey was used.
All five hosted jobs for 4070e06 completed successfully: application checks, seven-case SQL/Auth integration, and customer/merchant/driver Android build/identity/artifact verification. No broader native/provider acceptance is implied.

2026-10-17 expiry cleanup: 252 application tests passed (67 Functions, 87 UI, 98 server), zero failures/skips; TypeScript and development web build passed. New tests bundle the actual account module with controlled network/storage/native dependencies and verify expiry ordering, duplicate teardown, logout-expiry deadlock avoidance, cleanup failure isolation and login request deferral. Two tests bundle actual shared native cleanup and verify remote authorization failures still reach local token/native-auth cleanup. Logs: .cache/expiry-{lint,tests,build,targeted}.log (ignored). No Android/iOS device, real push/location or staging acceptance is implied. No backend/rules source changed in this increment.
Hosted run 39002500312 for source 79b7281 passed checks job 117308199047 and all seven SQL/Auth cases in accounts job 117308578738 (zero failures/cancellations/skips, script exit 0). Android jobs remained active at this observation; final build evidence is recorded after completion.
Final observation: all five jobs in run 39002500312 passed, including all three Android build/identity/artifact jobs. Artifact identities/expiry are recorded in ANDROID_CI_EVIDENCE_2026-10-17.md. Source 79b7281 therefore has passing hosted checks, 252 application tests, 112 Firestore/integration tests, seven real SQL/Auth cases and three Android debug builds. Device/plugin acceptance remains separate.

2026-10-17 notification registration lifecycle: TypeScript, 258 application tests (67 Functions, 93 UI, 98 server; zero failures/skips), secret scan and development build passed. Tests exercise actual notification/native-cleanup modules with controlled SDK bridges, including logout during permission/token/registration, account replacement, flag ownership and successful refresh. Logs: .cache/push-race-{lint,targeted,tests,build}.log (ignored). No backend/rules source changed; real push/provider/device acceptance is not claimed. Fresh hosted verification is pending at this source commit.
Final cleanup-order refinement passed TypeScript, all 258 application tests and development build again. The unresolved-token regression additionally proves local driver location is stopped before the push drain resolves, while token deletion remains deferred. Hosted evidence for earlier source revisions does not validate this final ordering.
Final push-generation implementation 57ebdd0 passed all five hosted jobs in run 39003265614. Account lifecycle job 117310837446 reports seven passed with no failures/skips; checks and all three audience-specific Android build/identity/artifact jobs passed. See the Android evidence file for artifact IDs. Earlier overlapping source 15e6e91 had one customer build fail on Maven Central HTTP 403 dependency download; the final source customer build passed, so that transient failure is recorded but not treated as a blocker.
# 2026-10-17 continuation verification

- `npm run test:rules`: **116 passed, 0 failed, 0 skipped** (2m03s); isolated Firestore authorization, integration and end-to-end booking tests, including partner applications, merchant/driver eligibility and all six service journeys. Missing optional Maps/Razorpay secrets emitted expected emulator warnings; no live provider calls or production data were used.
- `npm test`: passed; Functions, UI, server tests and working-tree secret scan.
- `npm run lint`: passed TypeScript check.
- `npm run build`: passed Vite production-compatibility build; existing large-chunk advisory remains.
- Hosted GitHub Actions run [39007835058](https://github.com/logeshn554/delivery123/actions/runs/39007835058) for `fb569c3`: all five jobs passed—checks, account lifecycle, and customer, merchant and driver Android debug build/identity/artifact jobs. Debug builds do not establish signed release or authenticated device acceptance.

## 2026-10-18 dispatch pagination

- `npm run test:rules`: **117 passed, 0 failed, 0 skipped**. New emulator regression seeds 101 eligible parcel bookings, verifies the first 100-page offer set, then confirms booking 101 appears on the following refresh with a live lease.
- `npm test`: passed (Functions, UI, server, working-tree secret scan); `npm run lint` and `npm run build` passed. Build retains the existing large-chunk advisory.
- Hosted verification for this source revision is pending; no load test, production dispatch, or live driver acceptance is claimed.

## 2026-10-18 no-response reoffer

- `npm run test:rules`: **118 passed, 0 failed, 0 skipped**. New regression verifies an expired no-response offer becomes visible to a second eligible driver, the first driver's expired acceptance is rejected, and the second driver wins the transactional assignment.
- `node --check tests/payments.integration.test.mjs` and `git diff --check` passed.
- GitHub combined-status lookup and the available commit workflow-run lookup returned no result for pushed revision `38e1301`; hosted verification remains unconfirmed.

## 2026-10-18 dispatch offer notifications

- `npm run test:rules`: **119 passed, 0 failed, 0 skipped**. New regression confirms dispatch pushes go only to a fresh, consented, verified, in-zone driver with approved parcel service, and payload excludes contact/pickup details. Existing tests cover expired-lease reoffer and 101-record pagination.
- `npm test`: passed (Functions, UI, server and secret scan); `npm run lint` and `npm run build` passed. The build retains the existing large-chunk advisory.
- `node --check` passed for the changed Functions files; Firestore index JSON parsed and includes the driver candidate query index; logout cleanup regression covers clearing the dispatch navigation intent.
- Provider/device delivery, background tap behavior, hosted CI for the recent pushed commits and production-scale dispatch load remain unverified.
- The available GitHub combined-status and commit workflow-run lookups returned no checks/runs for pushed commit `04caa15`.

## 2026-10-18 partner document expiry

- Added daily Asia/Kolkata expiry sweeps for operations-verified dates required by the published driver and merchant policies. Driver expiry blocks dispatch/acceptance and reactivation; an active delivery retains location and fulfillment access until completion, then the profile goes offline. Merchant expiry closes new orders, advances the application back to evidence review and leaves accepted orders untouched. Both sweeps record immutable events and renewal follows existing evidence review.
- `npm run test:rules`: **124 passed, 0 failed, 0 skipped**. Regressions cover driver/merchant expiry, idempotent sweeps, renewal, active custody/order preservation, online-rule protection, expired dispatch/push filtering, and six service journeys completing and retrying after a mid-job driver expiry.
- `npm test`, `npm run lint`, `npm run build`, `node --check` on changed Functions files, and `git diff --check` passed. The build retains the existing large-chunk advisory. Emulator warnings about unset Maps/Razorpay test secrets are expected; provider calls are mocked and no production data was used.
- The available GitHub combined-status and commit workflow-run lookups returned no checks or runs for pushed commits `a6f26a6` and `51d75f0`; hosted verification is unknown. ADB recheck failed because its local server would not start, so Swiggy inspection remains unverified. Policy configuration and real partner/device acceptance remain unverified.

## 2026-10-18 traffic-aware tracking estimates

- `functions/maps.js` now accepts an explicit traffic preference. `getTrackingRoute` requests `TRAFFIC_AWARE`; checkout and service-quote calls retain the default `TRAFFIC_UNAWARE`, so the ETA improvement does not alter fares. Added helper tests for both modes and invalid preference rejection.
- `npm --prefix functions test`: **69 passed, 0 failed, 0 skipped**. `npm test`: **69 Functions, 93 UI and 98 server tests passed**, secret scan passed (744 snapshots). `npm run test:rules`: **127 passed, 0 failed, 0 skipped**. TypeScript, development build, `node --check` and `git diff --check` passed; build retains the existing large-chunk advisory.
- Provider calls in tests are mocked. Live Maps traffic estimates, paid API behavior, quota/cost approval, hosted checks and native tracking acceptance remain unverified. Google documents traffic-aware Routes requests as higher-billing than traffic-unaware requests; the current tracking screen refresh interval therefore needs owner-approved Maps quota/budget before release.

## 2026-10-18 trip-bundle fallback deadline

- Added a policy helper and changed the scheduled fallback worker to wait `separatePartnerDeadlineMinutes` while the ride remains unassigned. It transactionally rechecks the current ride leg, commerce leg and fulfillment policy before changing fulfillment, and leaves an assigned ride driver untouched.
- `npm --prefix functions test`: **71 passed, 0 failed, 0 skipped**. `npm run test:rules`: **129 passed, 0 failed, 0 skipped**, including scheduled-worker cases before and after the timeout, with an assigned ride driver, and beyond the first 50 collection-group results. `npm test`: **71 Functions, 93 UI and 98 server tests passed**; secret scan inspected 744 snapshots. TypeScript lint and development build passed; the existing large-chunk advisory remains.
- The integration test uses the Firestore emulator and synthetic booking records. It does not establish production schedule delivery, real provider/driver availability, live dispatch fairness or native acceptance.

## 2026-10-18 standard dispatch lease expiry

- Driver offer refresh no longer resets active per-driver lease deadlines. Existing active offers remain visible ahead of newly discovered jobs; page rotation resumes as those leases expire, and no-response offers remain available to other eligible drivers.
- `npm --prefix functions test`: **71 passed, 0 failed, 0 skipped**. `npm run test:rules`: **130 passed, 0 failed, 0 skipped**, including repeated-poll expiry preservation, active offers retained when a nearer job appears, pagination after expiry and second-driver acceptance. `npm test`: **71 Functions, 93 UI and 98 server tests passed**; secret scan inspected 744 snapshots. TypeScript lint, development build, syntax checks and `git diff --check` passed; the build retains its existing large-chunk advisory.
- Provider/device timing and production load/fairness are not established by these emulator tests.

## 2026-10-18 COD dispatch timeout recovery

- Overdue dispatch escalation now recognizes `pending_cod` alongside `paid`; pre-capture and refund-review payment states remain ineligible. Added unit and Firestore emulator coverage for COD escalation and the resulting `no_partner` exception.
- `npm --prefix functions test`: **71 passed, 0 failed, 0 skipped**. `npm run test:rules`: **130 passed, 0 failed, 0 skipped**. TypeScript lint, development build, changed-file syntax checks and `git diff --check` passed. The build retains the existing large-chunk advisory.
- Emulator tests do not establish production scheduler delivery or live driver/operations response.

- COD exception reports and operations resolutions now accept active `pending_cod` bookings. `npm run test:rules`: **130 passed, 0 failed, 0 skipped**; the emulator verifies no-partner review restarts the search timer and a COD delivery incident can be reported and resolved. `npm test`: **71 Functions, 93 UI and 98 server tests passed**, and the secret scan inspected 744 snapshots. TypeScript lint, development build, syntax and diff checks pass; the build retains its existing large-chunk advisory. Emulator provider-secret warnings are expected because provider calls are mocked.

## 2026-10-18 release preflight and reference scope

- `node scripts/check-release.mjs --environment=staging` failed closed. Gate-A acceptance evidence, staging/provider configuration, private evidence storage/scanner settings, project-specific Functions configuration and matching Android/iOS registrations are missing; no configuration values were printed or changed.
- `adb devices -l` could not connect because the local ADB daemon failed to start. Prior AllGo install/launch evidence remains historical only; current device acceptance was not repeated.
- Further Swiggy reference inspection is stopped at the user's direction. Existing screenshots and observations remain evidence; undocumented journeys stay open.

## 2026-10-18 booking exception authorization

- Exception reports now require an active current customer, assigned driver, or assigned merchant account. Operations resolution also rejects disabled or suspended admins even when an admin claim remains in the token.
- `npm run test:rules`: **131 passed, 0 failed, 0 skipped**, including revoked-driver, suspended-driver and suspended-admin regressions. `npm --prefix functions test`: **71 passed, 0 failed, 0 skipped**. TypeScript lint, development build, syntax and diff checks passed; the build retains its existing large-chunk advisory.
- This verifies callable authorization against the Firestore emulator; deployed rules/provider acceptance remains open.

## 2026-10-18 legacy bundle migration claim check

- Legacy booking migration now requires both the active admin account role and the admin custom claim. The emulator rejects a role-only caller and accepts a claim-bearing dry run.
- `npm run test:rules`: **132 passed, 0 failed, 0 skipped**. `npm --prefix functions test`: **71 passed, 0 failed, 0 skipped**. TypeScript lint, development build, syntax and diff checks passed; the build retains its existing large-chunk advisory.
- The test covers local callable authorization; deployed claim propagation and migration approval remain open.

# 2026-10-18 iOS driver location source increment

- Commit `5bc66ab` adds the native iOS Core Location plugin, Firebase Functions reporting, Always permission/background mode, consent wording and native status/resume behavior. Uploads are limited to locations no older than 30 seconds, accuracy at most 100 metres, at least 15 seconds between reports; repeated upload failures stop tracking.
- `npm run lint` and `npm run build` passed. `npm --prefix functions test`: **71 passed, 0 failed**. `npm run test:rules`: **132 passed, 0 failed**. Python `plistlib` parsed `Info.plist` and confirmed the `location` background mode and Always usage string. `git diff --check` passed before commit.
- Xcode, Swift and CocoaPods are not installed on this Windows host. No iOS compile, signed build, simulator or device acceptance is established. Signed iOS testing and location-permission/background lifecycle checks remain open.

# 2026-10-18 concurrent driver acceptance

- Added a Firestore emulator test where two eligible drivers both obtain a live offer and race `acceptDriverBooking` for the same parcel. Exactly one call succeeds, the other receives `failed-precondition`, the booking names the winner, and only that driver's profile gets `activeBookingId`.
- `npm run test:rules`: **133 passed, 0 failed, 0 skipped** (130.2s). `node --check tests/payments.integration.test.mjs` and `git diff --check` passed. Optional Maps/Razorpay secret warnings are expected in this isolated emulator run; no live provider was called.
- The test verifies atomic first-committed acceptance only. It does not validate dispatch priority, provider delivery, load capacity or production fairness.

# 2026-10-18 dispatch timeout retry recovery

- The scheduled no-partner worker now persists transient booking failures in `dispatch_recovery_failures`, retries due work independently of the pagination cursor with bounded exponential backoff, and excludes queued IDs from the regular scan until retry time.
- The emulator regression injects a transient transaction failure, confirms the queued booking is not retried early, advances the cursor beyond it, then confirms retry escalates the booking and removes the queue record. `npm run test:rules`: **134 passed, 0 failed, 0 skipped**. `npm test`: **71 Functions, 95 UI, 98 server passed**; secret scan inspected 746 snapshots. TypeScript lint, development build, syntax and diff checks pass. Existing large-chunk build advisory remains.
- This is source/emulator evidence only. Live scheduled execution, operations ownership for prolonged retries/dead letters and broader payment/outbox reconciliation remain open.

# 2026-10-18 checkout reconciliation fairness

- `reconcileCheckoutIntents` now paginates open payment intents with a persisted `(createdAt, documentId)` cursor after each completed intent and wraps at the end of the result set. A Firestore integration test seeds 51 old provider-created wallet intents and returns mocked HTTP 503 responses, proving the worker checks 50, then the 51st, then wraps to the first page. Slow individual provider calls remain untested against a deployed timeout, but completed page items are checkpointed as they finish.
- `npm run test:rules`: **135 passed, 0 failed, 0 skipped** (130.8s). `node --check` for changed JavaScript and `git diff --check` passed. Provider access was mocked; no transaction or live schedule was run against Razorpay.
- This verifies local cursor fairness only. Signed provider reconciliation, deployed scheduler delivery, payment finality, and operations ownership for persistently failing records remain open.

# 2026-10-18 refund reconciliation checkpoints

- `reconcilePendingRefunds` now saves its document cursor after each completed provider check and resets after a full scan, so a slow or failing lookup cannot force the next invocation to replay the entire page.
- Added a Firestore integration test with 51 refund attempts and mocked HTTP 503 provider responses. Three scheduler invocations verify 50, then 1, then wrap-around to 50, while no refund amount or financial journal is changed. `npm run test:rules`: **136 passed, 0 failed, 0 skipped**. `npm test`: **71 Functions, 95 UI, 98 server passed**; secret scan inspected 746 snapshots. TypeScript lint, development build, JavaScript syntax and diff checks passed; the existing large-chunk advisory remains.

# 2026-10-18 grocery substitution expiry pagination

- The expiry scheduler now checkpoints each due reservation with an `(expiresAt, documentId)` cursor and wraps to the first page when it reaches the end. The emulator seeds 101 expired reservations, forces one transient transaction failure, verifies the 101st record is cleaned on the next page, then verifies the failed first record is retried after wrap-around.
- `npm run test:rules`: **137 passed, 0 failed, 0 skipped**. `npm test`: **71 Functions, 95 UI, 98 server passed**; secret scan inspected 746 snapshots. TypeScript lint, development build, syntax and diff checks passed; the existing large-chunk advisory remains. The emulator does not verify deployed schedule timing or owner-approved live stock operations.

# 2026-10-18 private evidence retention pagination

- Expired partner evidence cleanup now checkpoints each object with a `(retentionUntil, evidenceId)` cursor and wraps when it reaches the end. The integration regression fails storage deletion for the first of 101 records, verifies the 100 later records are not starved, then restores storage and verifies the first record is retried after wrap-around.
- `npm run test:rules`: **138 passed, 0 failed, 0 skipped**. `node --check` for changed JavaScript and `git diff --check` passed. The test uses memory storage plus the Firestore emulator; it does not establish production bucket IAM, object generation behavior or scheduler delivery.

# 2026-10-18 operations reference documentation

- Added a source-linked operational reference for lifecycle states, authorization boundaries, indexes/schema, migration caveats, and incident recovery.
- Reviewed links and file references against the current repository sources; no runtime behavior changed and no software test was warranted. This document is not evidence of deployed rules, indexes, schedules, production SLOs, or backup/restore acceptance.

# 2026-10-18 branch integration verification

- After resolving conflicts between the AllGo delivery work and the Stitch/fix branches, `npm run lint`, `npm run build`, and `npm test` passed. `npm run test:rules` passed **138 tests, 0 failed, 0 skipped**.
- The build reports the existing large-chunk advisory. Tests use local/emulated providers; they do not establish native device, hosted CI, staging, or provider acceptance.

# 2026-10-18 fresh verification on published main

- Confirmed published `main` at `d6d5feb68fb2b2615c062ac80a5000eb420cdb36`; the active AllGo branch tip `4230bc11c04eb3cc42d47b5cb038a5eae48db505` is included in its first-parent history. No branch commits were outstanding for integration.
- `npm run lint` and `npm run build` passed. Existing build advisory: the accounts bundle is 607 kB after minification.
- `npm test` passed: **71 Functions, 95 UI, 98 server tests**; secret scan inspected 697 snapshots and found no recognized secrets.
- `npm run test:rules` passed **138/138**, 0 failures and 0 skips after granting the local Firestore emulator loopback access. Tests use mocked/local providers; warning logs about absent Maps and Razorpay test secrets are expected and no live provider was called.
- `node scripts/check-release.mjs --environment=staging` failed closed. Gate-A acceptance, staging data/backend/email/App Check/support/legal settings, private evidence bucket/scanner, project Functions config, and matching native registrations remain missing. See `BLOCKERS.md`; no values were printed or changed.

# 2026-10-19 TripBundle account-export verification

- Account data export now returns a customer's bundle and its legs/events, plus legs/events for which the signed-in driver is currently assigned. Bundle payment identifiers and the separate delivery-code collection are excluded. Server ownership checks cover both customer and driver event history; driver pagination uses full document paths so identical leg IDs across bundles do not collide.
- Added emulator regression coverage for customer access, cross-account denial, assigned-driver scope and unrelated-driver isolation. A 102-leg driver fixture verifies full-path cursor pagination across the 100-record page boundary. `npm run lint` passed. `npm test` passed, including **98 UI tests**, and the secret scan inspected 700 snapshots with no recognized secrets. `npm run test:rules` passed **143 tests, 0 failed, 0 skipped** (148 seconds); local emulator required loopback permission. Emulator warnings for unset Maps/Razorpay test secrets are expected, and no live provider was called.
- This verifies emulator behavior only; mobile/native acceptance and production account-export acceptance remain open.

# 2026-10-18 account deletion claim serialization

## Follow-up 2026-10-19: merchant orders block account deletion

Deletion request and processing now query nonterminal bookings for the account's bound merchant ID. This prevents removal of a merchant operator while the restaurant/grocery still has orders needing preparation or handoff. Added the `bookings(merchantId,status)` composite index. Emulator regression verifies both stages reject an active order and allow a request after completion.

`npm run lint` passed. `npm run test:rules`: **142 passed, 0 failed, 0 skipped**. Changed JavaScript syntax, index JSON parsing and `git diff --check` passed. Deployed index and merchant provider acceptance remain open.

## Follow-up 2026-10-19: active driver bookings block deletion

Both deletion request and processing now query assigned nonterminal bookings independently of the driver profile's active-job pointer. The emulator regression removes that pointer, verifies an assigned transit booking blocks both stages without changing custody, then completes the booking and verifies a deletion request can proceed. The existing `bookings(driverId, status)` index covers the query.

`npm run test:rules`: **141 passed, 0 failed, 0 skipped**. Changed JavaScript syntax and whitespace checks passed. This verifies isolated callable behavior; deployed indexes, device and cross-store acceptance remain open.

## Follow-up 2026-10-19: linked identity survives partial cleanup

Retrying after `users/{uid}` was deleted previously overwrote the job's Neon account ID with null, allowing premature completion without SQL cleanup. The retry now preserves the recorded identity. A Firestore integration test injects a failure immediately after the user document is removed, retries, and verifies the same Neon ID, `firebase_completed` status and absent final completion timestamp. Firebase Auth operations are stubbed; Firestore cleanup and retry use the isolated emulator.

`npm run test:rules`: **140 passed, 0 failed, 0 skipped**. SQL deletion coordinator tests: **2 passed**. Changed JavaScript syntax checks and `git diff --check` pass. Deployed Auth/SQL orchestration and crash recovery remain unverified.

- `processAccountDeletion` now rejects jobs already in `processing`; only `requested` and explicitly `failed` jobs can be claimed. Firestore transaction retries therefore cannot start a second destructive cleanup for the same account while another operator is running it.
- Added an emulator regression that seeds an in-progress deletion and verifies a second operator call is rejected without changing job state or deleting the account.
- `npm test`: **71 Functions, 95 UI, 98 server passed**; secret scan inspected 697 snapshots. `npm run lint`, `npm run build`, syntax checks and `git diff --check` passed. `npm run test:rules`: **139 passed, 0 failed, 0 skipped**. Tests use local/emulated services; live cross-store deletion and crash-recovery acceptance remain open.

