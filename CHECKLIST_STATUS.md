# AllGo checklist execution status

Updated 9 October 2026. **The full checklist remains incomplete.** Implementation/local checks below are not real-provider or production acceptance. No phase has final staging acceptance.

## Phase 0: security and financial changes

| Task | Code and local evidence | Remaining acceptance |
| --- | --- | --- |
| SEC-01 coupons | Immutable quotes, single application, invalid coupon cannot consume quote; concurrent redemption test | Provider checkout/retry |
| SEC-02 top-up refunds | Cumulative partial/full reversals, idempotent ledgers, spent-credit debt preserved; reordered/concurrent tests | Actual provider refund and financial review |
| SEC-03 identity | Verified-email Neon/Firebase linking, trusted custom tokens, mapped UID, existing roles/wallet preserved; revoked/expired linked sessions denied by rules | Admin credentials, delivered verification emails, real linking/race/provider acceptance |
| SEC-04 privacy | Raw offers denied to unassigned drivers; callable field allowlist; four-role emulator tests | Coordinated rules/functions deployment and dispatch acceptance |
| SEC-05 completed refunds | Fulfilled status retained, no consumed stock restoration; integration test | Actual provider and finance reconciliation |
| SEC-06 coverage | Server geocoding, same enabled food/grocery zone, configured fee breakdown; coverage/fee tests | Real polygons/rates/Maps and address acceptance |
| SEC-07 transport | Approved equipment/type/mass/dimensions required; review UI, policy tests | Actual documents/equipment/carrier acceptance |
| SEC-08 App Check | Native/web provider code and conditional enforcement | Registrations, signed-device/browser attestation, then enforcement |
| SEC-09 sessions | HttpOnly/Secure web cookies, Android Keystore, iOS Keychain, linked-session expiry/revocation; cookie/rules tests; Android compiles | Actual device restart/logout/expiry and iOS build |
| SEC-10 rules tests | Isolated demo emulator covers four roles, contacts/codes/payments/session revocation | Remaining feature coverage and staged journeys |
| SEC-11 recovery | Hashed expiring codes, recovery/verification screens, reset revocation, verified-sender integration | Sender configuration and delivered email |
| SEC-12 limiter | Atomic PostgreSQL/Firestore counters, fail closed on database failure | Staged abuse/concurrency/proxy setup |
| SEC-13 headers/validation | API origin/security headers, generated CSP without production inline scripts, quote/catalog/capability validation; tests | Deployed proxy/provider browser acceptance |
| SEC-14 secrets | Ignored credentials, working-tree/history scan, separate environment configuration preflight | Independent real secret-manager/provider setup and rotation |

## Phase 1: core platform

Implemented/strengthened: verification and recovery screens, synced favorites/addresses/preferences, fee breakdown and coverage before payment, shared web/native Razorpay checkout including top-ups, payment recovery/idempotency, activity history, owner-scoped paginated data export, existing protected chat and location-freshness checks.

Remaining: verified email/phone changes; real Google/Apple/phone acceptance; detailed apartment/map-pin addresses; complete linked Neon/Firebase deletion processing; service cancellation policies and actual tax invoices; location-ranked dispatch, offer expiry/countdown/timeout/reassignment; delayed/no-partner/failed-delivery states; actual push/device/browser acceptance.

## Phase 2: food and grocery

Implemented/strengthened: server hours including overnight periods; merchant hours/temporary closure editor; dish/product creation/editing, prices, dish variants, allergens, units and stock; current catalog quotes; preparation/ready stages; recipient codes; owner-only completed-order reviews; current-price reorder entry points; configured fees/minimum baskets.

Remaining: location-aware discovery; extra add-ons/customization; reserved food slots; merchant rejection/refund and preparation ETA; food pickup proof; review aggregates; catalog removal/archive; grocery slots/store-specific polygons/variants/final weight; approved substitutions; picking/packing; partial fulfillment and item-refund allocations; expiry/batches/barcodes/imports; structured item complaints and merchant settlement reporting.

## Phase 3: parcel and transport

Implemented/strengthened: resolved routes, dimensions/configured volumetric weight, content/contact restrictions, requested pickup time, sender pickup and recipient delivery codes, custody events; dedicated vehicle flow, declared registration/ownership authorization, measured payload and condition notes; equipment approval/capacity fit; customer/driver transport details.

Remaining: reserved pickup slots; shipment labels/scanning; multi-leg custody; photographic/signature evidence; failure/reschedule/return-to-sender; structured claims; ownership documents; condition photos/inspection checklist; open/enclosed/towing selection; loading/logistics stages; delivery inspection/acceptance; vehicle disputes/documents/invoices. No insurance product has been invented or accepted.

## Phase 4: partners and operations

Implemented/strengthened: coverage/rate editor; equipment approvals; audited zone/rate/catalog/hour/equipment actions; online update failures surface; code handover and once-only earnings tests; existing payout requests/recorded transfers; catalog/hours controls; parcel filter and actual-record leaderboard.

Remaining: document uploads/KYC; complete merchant onboarding/application approval; consent-based background GPS; offer countdown/live dispatch board; specialized fleet management; settlement policy editor and finance reconciliation; structured disputes/incidents; merchant commission/payout reports; granular staff permissions/audit screens.

## Phase 5: interface and release

Implemented/strengthened: service/details and merchant modules; favorite namespaces/navigation; backend-backed reviews/export; zoom support; Java 21 discovery and ADB authorization checks; Android secure storage plugin/debug APK builds.

Remaining: native-friendly dialogs everywhere; complete offline/retry/accessibility/responsive acceptance; native Firebase files/fingerprints/iOS signing; provider/push/lifecycle device checks; deployed HTTPS API; signed Android/iOS pipelines; crash monitoring; approved legal policies/store disclosures. iOS cannot be compiled or device-tested on this Windows host.

## Phase 6: evidence

- TypeScript checks pass.
- 26 policy/server unit tests pass: 22 functions policies and four cookie/CSP tests.
- 17 local rules/transaction integration tests pass: four-role isolation, private records, revoked/expired linked sessions, coupons, concurrent last-stock purchases, duplicate confirmation, partial/reordered refunds, refund-before-capture, fulfilled refunds, merchant scope, reviews, export ownership, sender/recipient codes and once-only earnings.
- Production web build, Android sync and Java 21 debug APK build pass. This is not signed release/device acceptance.
- Production dependency audit: zero known vulnerabilities.
- Working-tree/Git-history credential scan passes without printing values.
- Staging configuration preflight intentionally fails: independent staging configuration and real provider/native credentials are missing.

Outstanding: real identity linking, all six full staging journeys, physical Android/iPhone testing, browser checkout, push, backups/restoration, monitoring/alerts and production approval. The previously declined live Neon account test has not been retried.

See `DEPLOYMENT_SETUP.md` for configuration and coordinated deployment prerequisites. Deploying code alone does not satisfy this checklist.
