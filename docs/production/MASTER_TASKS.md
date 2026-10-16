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
| FIX-02 | P1 | Booking subscription failures must clear stale sensitive data and surface actionable errors | Not started |
| AUTH-01 | P0 | Verify cross-store identity, role changes, revocation, logout and deletion with staging providers | Blocked |
| PAY-01 | P0 | Verify signed provider test payments, duplicate callbacks, recovery and refunds | Blocked |
| FOOD-01 | P1 | Customer → merchant → driver → delivered food journey with isolated test data | Not started |
| GROC-01 | P1 | Stock contention, picking/substitution, checkout and grocery fulfillment journey | Not started |
| PARCEL-01 | P1 | Parcel quote, assignment, custody proof, cancellation and delivery | Not started |
| RIDE-01 | P1 | Ride and driver-hire quote, assignment, live trip, completion and feedback | Not started |
| TRANS-01 | P1 | Vehicle custody documents, inspections, acknowledgments and claims | Not started |
| PARTNER-01 | P1 | Reconcile sibling merchant/driver projects with repository distribution/build strategy | Not started |
| MOBILE-01 | P1 | Android build and six-service emulator acceptance | Not started |
| MOBILE-02 | P1 | iOS archive and device journeys on supported macOS/Xcode host | Blocked |
| UI-01 | P2 | Preserve existing Stitch tokens; verify responsive/accessibility/keyboard states | Not started |
| RELEASE-01 | P0 | Provider, signing, policies, coverage, operations and release gate acceptance | Blocked |
| GIT-01 | P1 | Commit each validated increment and push without rewriting existing history | In progress |

Next executable work: finish FIX-01 integration validation and commit; then FIX-02. Reference inspection may continue independently without login bypass or purchases.

