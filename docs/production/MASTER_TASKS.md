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
| FIX-06 | P0 | Logout/expiry invalidate runtime identity despite storage/auth errors; stale storage reads/writes and pending requests cannot restore an invalidated session; 226 application tests pass; native expiry cleanup and persistence failure across restart remain | Source verified |
| FIX-07 | P0 | Neon-linked accounts require a live allgoSession claim for Firestore and callables, including local mode; missing-claim bypass reproduced then repaired; 111 emulator tests pass; coordinated deployment/real-provider acceptance remain | Emulator verified |
| AUTH-01 | P0 | Verify cross-store identity, role changes, revocation, logout and deletion with staging providers | Blocked |
| AUTH-LOCAL-01 | P0 | Hosted run 39000324482 account job passes all six real PostgreSQL/Auth/Firestore lifecycle cases with no skips; registration/bridge, logout/password revocation, duplicate-phone races, cookies, limited migration and expiry verified; real providers/native acceptance remain | Verified (isolated services) |
| PAY-01 | P0 | Verify signed provider test payments, duplicate callbacks, recovery and refunds | Blocked |
| FOOD-01 | P1 | Isolated wallet checkout → merchant → private driver offer → recipient-code completion → review passes; native/provider acceptance remains | Verified |
| GROC-01 | P1 | Isolated grocery checkout/picking/fulfillment passes; stock contention covered; substitution implementation and native acceptance remain | In progress |
| PARCEL-01 | P1 | Parcel quote/wallet/pickup-code/delivery journey verified; photo proof, returns/claims and native acceptance remain | In progress |
| RIDE-01 | P1 | Ride/driver-hire quote/wallet/assignment/codes/completion backend journeys verified; live tracking/native/payment acceptance remains | In progress |
| TRANS-01 | P1 | Transport quote/wallet/carrier eligibility/pickup/delivery backend journey verified; custody documents/inspections/claims remain | In progress |
| PARTNER-01 | P1 | Shared tracked role workspaces, distinct app IDs/schemes and reproducible Android debug builds; provider, iOS and authenticated partner acceptance remain | In progress |
| NOTIFY-01 | P1 | Audience-scoped push and current recipient routing; partner taps resolve only against assigned feeds, focus active order/job controls and show terminal/unavailable states; 233 application tests and partner web builds pass; real-device delivery/tap and unassigned-offer notifications remain | In progress |
| MERCHFIN-01 | P0 | Removed fabricated merchant transfers/bank verification and assumed commission; assigned completed booking values render with explicit payout-unavailable state; real merchant allocation, ledger, bank verification and payout workflow remain unimplemented | In progress |
| MOBILE-01 | P1 | All three debug apps install/launch on recovered Pixel_8; customer recovery and partner recovery/welcome inspected; six-service authenticated native acceptance awaits backend/providers | In progress |
| MOBILE-02 | P1 | iOS archive and device journeys on supported macOS/Xcode host | Blocked |
| CI-01 | P1 | Hosted run 39000324482 for 0850bd9 passes application checks, six real SQL/Auth lifecycle tests and all three Android build/identity/artifact jobs; seven-day debug artifacts observed; release acceptance remains separate | Verified (debug builds) |
| CSP-01 | P1 | Reproduced Firebase bootstrap script denial; allow exact apis.google.com script origin, retain production inline/eval restrictions; 240 application tests and rebuilt customer runtime check pass; provider auth acceptance remains | Source/runtime verified |
| UI-01 | P2 | Public partner recovery/welcome and customer recovery inspected at 1080×2400; broader responsive/accessibility/keyboard and authenticated states remain | In progress |
| RELEASE-01 | P0 | Provider, signing, policies, coverage, operations and release gate acceptance | Blocked |
| GIT-01 | P1 | Commit each validated increment and push without rewriting existing history | In progress |

Next executable work: verify partner startup and application/assignment transitions on an isolated backend; complete audience-specific release registration and acceptance gates. Native authenticated acceptance needs isolated backend/provider configuration. Reference inspection may continue independently without login bypass or purchases.
