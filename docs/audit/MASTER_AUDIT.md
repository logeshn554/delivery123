# AllGo master audit

2026-10-16. This consolidates existing audit evidence and current source inspection; the full codebase is not newly certified. The detailed unresolved findings in remediation-register.md and journey-acceptance.md under 2026-10-13 remain open.

## Architecture and current evidence

- Existing repository matches delivery123 origin. Dedicated production branch contains prior work; retain logical commits.
- React 19/TypeScript/Vite with Capacitor Android and iOS. Existing reusable components and original Stitch-informed design tokens live in src/design-system. No unrelated demo replacement or framework migration.
- Neon owns account credentials/sessions; Firebase owns linked service roles, catalogs, bookings, payments, dispatch and tracking. See ../architecture/record-authority.md. Dual-store acceptance remains incomplete.
- Callable business workflows and domain policies exist in functions; default-deny Firestore/Storage rules and emulator suites exist. Existence is not deployed correctness.
- Food/grocery, parcel, ride/hire and vehicle transportation have separate form/policy modules. Combined journeys and movers deliberately unavailable. MerchantPortal and DriverApp exist; customer App renders CustomerApp or AdminDashboard. Sibling partner apps live outside this Git checkout and need a distribution strategy.
- Payments use Razorpay web/native adapter and verified backend paths; Maps, push, Android location service and privacy/consent code exist. Current provider/device acceptance not established.
- CI runs typecheck, unit/server tests, emulator tests, web build, fixture and dependency audit. Native release/signing and iOS acceptance remain gaps.
- Baseline lint/test pass. Historical large-chunk and native configuration gaps remain tracked. No dependency is declared unused without an import/build audit.

## Prioritized current findings

| ID | File / area | Severity | Root cause | Fix / priority | Validation |
|---|---|---|---|---|---|
| FIX-01 | src/App.tsx booking effect | High | Customer audience condition precedes admin role while admin UI renders | Admin-first scope selection, scope reset and cleanup guard / P1 | Scope tests plus existing emulator admin/claim/revocation tests |
| FIX-02 | src/data/firebaseHelper.ts booking listeners | High | Errors logged without clearing stale rows or notifying workspace | Error propagation and stale-data teardown / P1 | Listener error, recovery and scope-change tests |
| FIX-03 | functions/index.js, firestore.rules | Critical | Old verified driver profile and assigned UID permitted transitions and private reads after account role revocation | Current role/profile checks in fulfillment transaction, read rules, tracking route and transactional chat / P0 | Regression reproduced missing rejection; six-service transition, chat/route rejection and private-data emulator tests; 100 passed |
| AUD-03 | src/App.tsx, sibling partner apps | High | Role components in repository do not by themselves provide packaged merchant/driver entry points | Verify intended separate app strategy and shared backend alignment / P1 | Build/install and role journey evidence |
| AUD-04 | functions, server/accounts.mjs | Critical release gate | Cross-store/provider integration not accepted | Isolated staging identity/payment/fulfillment tests / P0 | Replay, revocation, concurrency and provider evidence |
| AUD-05 | TransportBookingScreen, transportPolicy | High | Custody uploads/inspection/claims incomplete per existing audit | Complete independently authorized transport evidence workflow / P1 | Ownership, scan, retention, handoff/claim tests |
| AUD-06 | ios, native Firebase configuration | High | Supported iOS host/provider registrations absent | Configure/test on macOS and devices / P1 | Signed archive and actual journeys |
| AUD-07 | driverLocation.ts, native services | High | Android service source does not prove background/offline behavior; iOS gap | Permission/lifecycle and retention acceptance / P1 | Publishing, subscriber authorization, stop/logout, stale/offline tests |
| AUD-08 | src/components/CustomerApp.tsx, functions/index.js | Medium | Concentrated modules and duplicated sibling sources | Extract only while fixing tested workflows / P2 | Existing behavior preserved and build tests |
| AUD-09 | docs/production | High process gap | Required resumable tracker missing | Create canonical tracker and link prior unresolved findings / P1 | Every unresolved domain retained with evidence and next action |

Screen/feature matrix: ../reference-analysis/feature-gap-matrix.md. Source inventory: existing 2026-10-13/component-comparison.md. Design direction: existing 2026-10-13/design-system.md and stitch-2026-10-13/README.md. Full remediation priorities and production infrastructure: remediation-register.md. These links retain prior analysis rather than repeating it or treating checkboxes as runtime proof.

FIX-04 (P0 functionality): functions/index.js pricing result builders included an undefined fareBreakdown for ride/takeover/transport, so getServiceQuote failed to persist valid quotes. Reproduced through real callable/emulator journeys and fixed by omitting the inapplicable field. Parcel breakdown remains intact. Six independent service inputs and custody/settlement journeys now pass in the 104-test emulator suite. Staging/native provider acceptance remains required.
