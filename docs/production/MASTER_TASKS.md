# AllGo master execution tracker

Updated 2026-10-17 (Asia/Calcutta). Existing branch: `codex/allgo-production-foundations`.
Statuses describe the stated scope only. Unit verification is not mobile or release acceptance.
The detailed unresolved backlog in `../audit/remediation-register.md` remains binding; no older unchecked item is closed by this tracker.

| ID | Priority | Task / completion evidence | Status |
|---|---|---|---|
| REF-01 | P1 | Detect emulator/package and launch Swiggy | Verified |
| REF-02 | P1 | Observe accessible screens and record screenshots; initial capture black, UI dump unavailable | In progress |
| AUD-01 | P0 | Consolidate existing architecture audit and screen gap matrix; continue source review for unexamined paths | In progress |
| FIX-01 | P1 | Operations Hub uses administrator booking scope, clears prior scope and ignores late callbacks; 4 scope tests and 96 emulator tests pass; authenticated device acceptance remains separate | Verified |
| FIX-02 | P1 | Booking subscription failures clear cached rows/codes, stop joined listeners and offer retry/sign-out; 8 scope/lifecycle tests pass | Verified |
| FIX-03 | P0 | Revoke driver fulfillment, private data, tracking-route and chat access using current account role and verified profile; 100 emulator/integration tests and 211 application tests pass | Verified |
| FIX-04 | P0 | Ride/hire/transport quote writes omit inapplicable undefined fare breakdown; all six backend journeys and 104 emulator tests pass | Verified |
| FIX-05 | P1 | Manual Neon/Firebase logout runs push and native credential cleanup before primary sign-out; failure isolation covered by 217 application tests; native/provider acceptance remains | Source verified |
| FIX-06 | P0 | Logout/API-detected expiry share native push/location/auth cleanup before runtime invalidation; concurrent teardown is deduplicated and replacement login waits before its network request; 252 application tests and web build pass; real-device expiry detection/cleanup and persistence failure across restart remain | Source verified |
| FIX-07 | P0 | Neon-linked accounts require a live allgoSession claim for Firestore and callables, including local mode; missing-claim bypass reproduced then repaired; 111 emulator tests pass; coordinated deployment/real-provider acceptance remain | Emulator verified |
| AUTH-01 | P0 | Verify cross-store identity, role changes, revocation, logout and deletion with staging providers | Blocked |
| AUTH-LOCAL-01 | P0 | Hosted run 39000324482 account job passes all six real PostgreSQL/Auth/Firestore lifecycle cases with no skips; registration/bridge, logout/password revocation, duplicate-phone races, cookies, limited migration and expiry verified; real providers/native acceptance remain | Verified (isolated services) |
| PAY-01 | P0 | Verify signed provider test payments, duplicate callbacks, recovery and refunds | Blocked |
| FOOD-01 | P1 | Isolated wallet checkout → merchant → private driver offer → recipient-code completion → review passes; native/provider acceptance remains | Verified |
| GROC-01 | P1 | Store proposes a live catalog replacement; customer accepts with disclosed wallet debit/refund or removes/refunds; 15-minute expiry blocks late choices and scheduled cleanup releases stock; 116 isolated Firestore tests; real partner/native acceptance remain | In progress |
| PARCEL-01 | P1 | Parcel quote/wallet/pickup-code/delivery journey verified; recipient-code completion is audited; photo proof, returns/claims and native acceptance remain | In progress |
| RIDE-01 | P1 | Ride/driver-hire quote/wallet/assignment/codes/completion backend journeys verified; live tracking/native/payment acceptance remains | In progress |
| TRANS-01 | P1 | Transport quote/wallet/carrier eligibility/pickup/delivery backend journey verified; custody documents/inspections/claims remain | In progress |
| PARTNER-01 | P1 | Shared tracked role workspaces; isolated Firestore tests cover application intake, revision-safe review/correction, document review, driver eligibility, merchant setup and eligibility, plus assignment and delivery journeys (116 emulator tests pass); provider, iOS and authenticated partner acceptance remain | In progress |
| NOTIFY-01 | P1 | Audience-scoped push and assigned-feed tap routing; opt-in is UID-owned, pending intent is invalidated on logout/expiry and started token/registration work drains before unregister/delete; 258 application tests and web build pass; real-device delivery/tap/race and unassigned-offer notifications remain | In progress |
| MERCHFIN-01 | P0 | Removed fabricated merchant transfers/bank verification and assumed commission; assigned completed booking values render with explicit payout-unavailable state; real merchant allocation, ledger, bank verification and payout workflow remain unimplemented | In progress |
| MOBILE-01 | P1 | All three debug apps install/launch on recovered Pixel_8; customer recovery and partner recovery/welcome inspected; six-service authenticated native acceptance awaits backend/providers | In progress |
| MOBILE-02 | P1 | iOS archive and device journeys on supported macOS/Xcode host | Blocked |
| CI-01 | P1 | Hosted run 39007835058 for fb569c3 passes checks, account integration and all three Android build/identity/artifact jobs; debug artifacts retained; release acceptance remains separate | Verified (debug builds) |
| CSP-01 | P1 | Reproduced Firebase bootstrap script denial; allow exact apis.google.com script origin, retain production inline/eval restrictions; 240 application tests and rebuilt customer runtime check pass; provider auth acceptance remains | Source/runtime verified |
| UI-01 | P2 | Public partner recovery/welcome and customer recovery inspected at 1080×2400; broader responsive/accessibility/keyboard and authenticated states remain | In progress |
| RELEASE-01 | P0 | Provider, signing, policies, coverage, operations and release gate acceptance | Blocked |
| MIGRATION-02 | P1 | New imports preserve validated delivery metadata and receipt-protected edits/deletions; seven real SQL/Auth cases and 112 Firestore/integration tests pass for 4070e06 in hosted run 39001327488; historical completed imports and other formats need reconciliation | In progress |
| GIT-01 | P1 | Commit each validated increment and push without rewriting existing history | In progress |

Hosted run 39007074131 failed only the customer Android job during Gradle dependency resolution; the subsequent run 39007835058 passed all jobs, so the dependency failure was transient.

Next executable work: complete the parcel proof lifecycle after the owner publishes the delivery-evidence policy and consent/access rules; independently continue source-supported service improvements and rerun permitted Swiggy inspection when ADB returns. Partner application/eligibility integration is already covered by the 116-test isolated emulator suite. Native authenticated acceptance still needs isolated backend/provider configuration.
