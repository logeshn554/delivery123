# AllGo master execution tracker

Updated 2026-10-18 (Asia/Calcutta). Existing branch: `codex/allgo-production-foundations`.
Statuses describe the stated scope only. Unit verification is not mobile or release acceptance.
The detailed unresolved backlog in `../audit/remediation-register.md` remains binding; no older unchecked item is closed by this tracker.

| ID | Priority | Task / completion evidence | Status |
|---|---|---|---|
| REF-01 | P1 | Detect emulator/package and launch Swiggy | Verified |
| REF-02 | P1 | Existing captures document the out-of-coverage home, location error, Add New Address map picker and manual-search field with keyboard; no address query or save was performed. Further Swiggy inspection stopped at the user's direction; retry, results selection and later journeys remain undocumented | Blocked |
| AUD-01 | P0 | Consolidate existing architecture audit and screen gap matrix; continue source review for unexamined paths | In progress |
| FIX-01 | P1 | Operations Hub uses administrator booking scope, clears prior scope and ignores late callbacks; 4 scope tests and 96 emulator tests pass; authenticated device acceptance remains separate | Verified |
| FIX-02 | P1 | Booking subscription failures clear cached rows/codes, stop joined listeners and offer retry/sign-out; 8 scope/lifecycle tests pass | Verified |
| FIX-03 | P0 | Revoke driver fulfillment, private data, tracking-route and chat access using current account role and verified profile; 100 emulator/integration tests and 211 application tests pass | Verified |
| FIX-04 | P0 | Ride/hire/transport quote writes omit inapplicable undefined fare breakdown; all six backend journeys and 104 emulator tests pass | Verified |
| FIX-05 | P1 | Manual Neon/Firebase logout runs push and native credential cleanup before primary sign-out; failure isolation covered by 217 application tests; native/provider acceptance remains | Source verified |
| FIX-06 | P0 | Logout/API-detected expiry share native push/location/auth cleanup before runtime invalidation; concurrent teardown is deduplicated and replacement login waits before its network request; 252 application tests and web build pass; real-device expiry detection/cleanup and persistence failure across restart remain | Source verified |
| FIX-07 | P0 | Neon-linked accounts require a live allgoSession claim for Firestore and callables, including local mode; missing-claim bypass reproduced then repaired; 111 emulator tests pass; coordinated deployment/real-provider acceptance remain | Emulator verified |
| DISPATCH-01 | P1 | Per-driver service/zone pagination, fresh-location eligibility, proximity-ranked offers, fixed nonrenewing 30-second leases, expired no-response reoffer, paginated later-driver alerts and concurrent one-winner acceptance are emulator-covered; configured no-partner escalation and trip-bundle fallback are covered. Owner-approved centralized priority policy, live Maps billing/provider acceptance, production-scale load/fairness and native acceptance remain | In progress |
| AUTH-01 | P0 | Verify cross-store identity, role changes, revocation, logout and deletion with staging providers | Blocked |
| AUTH-LOCAL-01 | P0 | Hosted run 39000324482 account job passes all six real PostgreSQL/Auth/Firestore lifecycle cases with no skips; registration/bridge, logout/password revocation, duplicate-phone races, cookies, limited migration and expiry verified; real providers/native acceptance remain | Verified (isolated services) |
| PAY-01 | P0 | Verify signed provider test payments, duplicate callbacks, recovery and refunds | Blocked |
| FOOD-01 | P1 | Isolated wallet checkout → merchant → private driver offer → recipient-code completion → review passes; native/provider acceptance remains | Verified |
| GROC-01 | P1 | Store proposes a live catalog replacement; customer accepts with disclosed wallet debit/refund or removes/refunds; 15-minute expiry blocks late choices and scheduled cleanup releases stock; 116 isolated Firestore tests; real partner/native acceptance remain | In progress |
| PARCEL-01 | P1 | Parcel quote/wallet/pickup-code/delivery journey verified; recipient-code completion is audited; photo proof requires a published privacy policy URL and approved consent/access/deletion lifecycle; returns/claims and native acceptance remain | In progress |
| RIDE-01 | P1 | Ride/driver-hire quote/wallet/assignment/codes/completion backend journeys verified; live tracking/native/payment acceptance remains | In progress |
| TRANS-01 | P1 | Transport quote/wallet/carrier eligibility/pickup/delivery backend journey verified; custody documents/inspections/claims remain | In progress |
| PARTNER-01 | P1 | Shared tracked role workspaces; driver and merchant expiry automation is emulator-covered with dispatch/catalog blocking, evidence renewal, active-custody/order preservation and driver reactivation rules. iOS background driver-location source is implemented and source-checked; signed native acceptance remains. Owner policy, provider and authenticated partner acceptance remain | In progress |
| NOTIFY-01 | P1 | Audience-scoped push and assigned-feed tap routing; generic dispatch alerts target fresh, eligible, in-zone drivers and open the driver offer workspace; newly available drivers now receive privacy-minimal alerts for existing offers; UID-owned opt-in and pending-route logout cleanup; real-device delivery/tap/race acceptance remains | In progress |
| MERCHFIN-01 | P0 | Removed fabricated merchant transfers/bank verification and assumed commission; assigned completed booking values render with explicit payout-unavailable state; real merchant allocation, ledger, bank verification and payout workflow remain unimplemented | In progress |
| MOBILE-01 | P1 | All three debug apps install/launch on recovered Pixel_8; customer recovery and partner recovery/welcome inspected; six-service authenticated native acceptance awaits backend/providers | In progress |
| MOBILE-02 | P1 | iOS archive and device journeys on supported macOS/Xcode host | Blocked |
| CI-01 | P1 | Hosted run 39007835058 for fb569c3 passes checks, account integration and all three Android build/identity/artifact jobs; debug artifacts retained. Push through 4b9d354 succeeded; GitHub status and workflow-run lookups returned no hosted result for that code commit as of 2026-10-18 | In progress |
| CSP-01 | P1 | Reproduced Firebase bootstrap script denial; allow exact apis.google.com script origin, retain production inline/eval restrictions; 240 application tests and rebuilt customer runtime check pass; provider auth acceptance remains | Source/runtime verified |
| UI-01 | P2 | Public partner recovery/welcome and customer recovery inspected at 1080×2400; broader responsive/accessibility/keyboard and authenticated states remain | In progress |
| RELEASE-01 | P0 | Provider, signing, policies, coverage, operations and release gate acceptance | Blocked |
| MIGRATION-02 | P1 | New imports preserve validated delivery metadata and receipt-protected edits/deletions; seven real SQL/Auth cases and 112 Firestore/integration tests pass for 4070e06 in hosted run 39001327488; historical completed imports and other formats need reconciliation | In progress |
| GIT-01 | P1 | Commit each validated increment and push without rewriting existing history | In progress |

Hosted run 39007074131 failed only the customer Android job during Gradle dependency resolution; the subsequent run 39007835058 passed all jobs, so the dependency failure was transient.

Next executable work: continue standard dispatch recovery only after the owner supplies prioritized service policy, or validate current first-wins acceptance behavior against an explicitly adopted operating policy; load/fairness thresholds are not available. Keep parcel customer-photo proof disabled until the owner supplies the exact published privacy-policy URL and consent/access/deletion rules. A synthetic parcel handoff fixture is available at `../test-fixtures/parcel-handoff-synthetic.png` for UI/testing only. Swiggy reference inspection is closed at the user's direction; its documented screens remain evidence only. Driver and merchant expiry are covered in source/emulator tests; partner policy/provider acceptance and authenticated native acceptance still need owner/provider setup.
