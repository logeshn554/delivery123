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
| AUTH-01 | P0 | Verify cross-store identity, role changes, revocation, logout and deletion with staging providers | Blocked |
| PAY-01 | P0 | Verify signed provider test payments, duplicate callbacks, recovery and refunds | Blocked |
| FOOD-01 | P1 | Isolated wallet checkout → merchant → private driver offer → recipient-code completion → review passes; native/provider acceptance remains | Verified |
| GROC-01 | P1 | Isolated grocery checkout/picking/fulfillment passes; stock contention covered; substitution implementation and native acceptance remain | In progress |
| PARCEL-01 | P1 | Parcel quote/wallet/pickup-code/delivery journey verified; photo proof, returns/claims and native acceptance remain | In progress |
| RIDE-01 | P1 | Ride/driver-hire quote/wallet/assignment/codes/completion backend journeys verified; live tracking/native/payment acceptance remains | In progress |
| TRANS-01 | P1 | Transport quote/wallet/carrier eligibility/pickup/delivery backend journey verified; custody documents/inspections/claims remain | In progress |
| PARTNER-01 | P1 | Shared tracked role workspaces, distinct app IDs/schemes and reproducible Android debug builds; provider, iOS and authenticated partner acceptance remain | In progress |
| MOBILE-01 | P1 | Debug build/install/startup recovery verified; six-service native acceptance awaits reachable backend/providers | In progress |
| MOBILE-02 | P1 | iOS archive and device journeys on supported macOS/Xcode host | Blocked |
| UI-01 | P2 | Preserve existing Stitch tokens; verify responsive/accessibility/keyboard states | Not started |
| RELEASE-01 | P0 | Provider, signing, policies, coverage, operations and release gate acceptance | Blocked |
| GIT-01 | P1 | Commit each validated increment and push without rewriting existing history | In progress |

Next executable work: verify partner startup and application/assignment transitions on an isolated backend; complete audience-specific release registration and acceptance gates. Native authenticated acceptance needs isolated backend/provider configuration. Reference inspection may continue independently without login bypass or purchases.
