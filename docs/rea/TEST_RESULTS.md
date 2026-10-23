# Verification — 2026-10-23

| Check | Result | Scope / limitations |
|---|---|---|
| `npm run lint` | PASS | TypeScript no-emit check |
| `npm run build` | PASS | Development web bundle; existing large-chunk warning; no release-readiness claim |
| `npm test` | PASS | Functions: 74; UI: 155; server: 116; working-tree secret scan passed. Full suite passed after initial invalid-body test fix |
| `node --test server/accountInputPolicy.test.mjs server/accountErrorPolicy.test.mjs` | PASS, 4 tests | Final middleware includes bodyless JSON compatibility; tests use real loopback HTTP and parser. Requires approved execution outside sandbox |
| `npm run test:rules` | PASS, 147 tests | Isolated Firestore authorization and bundle/payment/partner evidence integration; payment providers use test seams, not real provider transactions |
| Isolated `scripts/run-account-tests.mjs` | PASS, 9 tests | Fresh PostgreSQL 17 database and Auth/Firestore emulators; actual account server. New malformed-payload regression and existing registration/session/bridge/address/ownership lifecycle tests all passed. Final duration 19.9s; no skips. Test services stopped afterward |
| Android build | PASS | `npm run build:app -- --platform=android`; 308 Gradle tasks, build successful in 6m33s; debug APK at `.cache/apps/customer/app-debug.apk` |
| AllGo Android startup | PARTIAL | `adb install -r` succeeded; process and foreground `in.allgo.app/.MainActivity` observed. `am start -W` returned `Status: timeout`, 67093ms. This does not pass workflow acceptance. Screenshot attempt did not produce a usable image |
| iOS | Not run | No supported iOS execution environment used |
| Swiggy runtime/UI | Intentionally not run | Static-only investigation |

Full logs: `.cache/rea-npm-test.log`, `.cache/rea-rules-test.log`, `.cache/rea-android-build.log`, `.cache/rea-accounts-test.log`, `.cache/rea-accounts-test-retry.log`, `.cache/rea-accounts-test-final.log`. These are ignored local files, not release artifacts. Initial account execution lacked dedicated credentials; generated fresh test-only credentials resolved this. First provisioned run failed startup under host memory pressure; second passed 8/9 with one existing lifecycle request timeout. After emulator cleanup, a fresh final run passed 9/9 without changing test deadlines or bypassing safeguards. Earlier failures remain retained in their logs. Final working-tree secret scan passed (729 snapshots).

Later independent implementation verification: COD changes pass 77 Functions + 156 UI + 116 server tests and 158 Firebase/rules/integration tests. All three canonical Android debug builds and both standalone partner TypeScript/web builds passed. Exact artifacts, source-sync scope, resource-related failed attempts and remaining native/provider limits are in `../production/2026-10-23-production-work.md`; the earlier checkpoint results above are historical, not the latest application inventory.
