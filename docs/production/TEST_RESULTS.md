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
| Reference screen capture | Incomplete | Initial screenshot black, hierarchy null; not evidence of visible screen design |
| Android build/current workflow | Not run yet | Earlier logs are not current acceptance |
| iOS build/device | Blocked | Windows execution host lacks supported Xcode environment |

Store reference captures only in ignored `.cache/reference-analysis/`. Do not commit APKs or proprietary reference images.

Post-change npm test: 207 passed (67 Functions, 46 UI, 94 server), secret scan passed. Development build passed with existing 603.73 kB accounts chunk warning. git diff --check passed. Staging preflight failed closed on missing configuration, native registrations and operator acceptance. Firestore first attempt failed on sandbox loopback permissions; elevated isolated rerun passed.
