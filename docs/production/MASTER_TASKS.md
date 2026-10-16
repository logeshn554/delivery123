# AllGo master execution tracker

Updated 2026-10-16 (Asia/Calcutta). Existing branch: `codex/allgo-production-foundations`.
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
| AUTH-01 | P0 | Verify cross-store identity, role changes, revocation, logout and deletion with staging providers | Blocked |
| PAY-01 | P0 | Verify signed provider test payments, duplicate callbacks, recovery and refunds | Blocked |
| FOOD-01 | P1 | Isolated wallet checkout → merchant → private driver offer → recipient-code completion → review passes; native/provider acceptance remains | Verified |
| GROC-01 | P1 | Isolated grocery checkout/picking/fulfillment passes; stock contention covered; substitution implementation and native acceptance remain | In progress |
| PARCEL-01 | P1 | Parcel quote, assignment, custody proof, cancellation and delivery | Not started |
| RIDE-01 | P1 | Ride and driver-hire quote, assignment, live trip, completion and feedback | Not started |
| TRANS-01 | P1 | Vehicle custody documents, inspections, acknowledgments and claims | Not started |
| PARTNER-01 | P1 | Reconcile sibling merchant/driver projects with repository distribution/build strategy | Not started |
| MOBILE-01 | P1 | Debug build/install/startup recovery verified; six-service native acceptance awaits reachable backend/providers | In progress |
| MOBILE-02 | P1 | iOS archive and device journeys on supported macOS/Xcode host | Blocked |
| UI-01 | P2 | Preserve existing Stitch tokens; verify responsive/accessibility/keyboard states | Not started |
| RELEASE-01 | P0 | Provider, signing, policies, coverage, operations and release gate acceptance | Blocked |
| GIT-01 | P1 | Commit each validated increment and push without rewriting existing history | In progress |

Next executable work: verify quote-to-delivery backend journeys for parcel, rides, driver hire and vehicle transport. Native authenticated acceptance needs isolated backend/provider configuration. Reference inspection may continue independently without login bypass or purchases.
