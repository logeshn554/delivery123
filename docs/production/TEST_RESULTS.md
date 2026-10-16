# Test results

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
