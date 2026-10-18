# Audit remediation register

Updated 2026-10-12. Baseline requested audit: commit 489991268ab7164ec05108270aa5cd59025193de. The full supplied report is preserved in source-2026-10-09.md. This register explicitly retains unfinished work; code changes are not production acceptance.

The user authorized fixing every finding and creating missing environment setup. Live resource creation is currently blocked by missing authenticated owner accounts/tools, business identity, cities, provider onboarding and signing. Substantial implementation remains as listed below. No release gate is accepted.

## Verification on 2026-10-10

- TypeScript check passed (`npm run lint`).
- Unit/server suites passed: 29 Functions policy tests and 6 server tests; working-tree secret scan passed.
- Firestore/payment emulator suites passed: 28 tests, including concurrent stock/payment/completion, refund replay, role revocation, location consent and independent pricing review. Provider calls use mocks; this does not constitute live Razorpay acceptance.
- Development web bundle built successfully; fixture scanner found no demo fixtures. This is not a production or signed native release.
- New goods/movers domain design: `docs/architecture/goods-and-movers.md`. Implementation, verified fleets and staging acceptance remain pending.
- Sign-out now stops native driver tracking and attempts server consent withdrawal before clearing the authenticated session. Offline sign-out still needs device acceptance.

## Named findings

| ID | Finding | Status | Work and remaining evidence |
|---|---|---|---|
| P0-01 | Two partially overlapping backends require a single authoritative contract. | Partial | Record authority is documented; unique identity mapping is server-owned; release Functions require a live Neon-backed bridge session; SQL booking history is explicitly marked legacy/read-only and customer UI hides live tracking, codes, chat, cancellation, reviews and unverified payment claims for those rows. Local Firebase-only development remains available. Legacy SQL fulfillment reads still need an approved migration/retirement plan; full cross-store lifecycle acceptance remains pending. Evidence: `docs/audit/implementation-2026-10-12.md`. |
| P0-02 | Production acceptance and provider configurations are absent from evidence. | Blocked on owner setup | Environment templates and evidence gates created; no cloud/provider resources or staging acceptance exists. |
| P0-03 | Database and project configuration can drift. | Implemented; acceptance pending | Explicit CLI configs, runtime/native database alignment checks, separated databases and release fallback checks. Real resources still needed. |
| P0-04 | Service identity, payment and booking journey must be tested atomically. | Partial | Durable creation intents, deterministic receipt recovery job, safe claim release and customer recovery implemented. Full payment/fulfillment/outbox and provider settlement acceptance pending. |
| P0-05 | Real driver/merchant eligibility is not operationally accepted. | Partial implementation + owner configuration and partner acceptance blocked | Merchant application-to-review links applicant/catalog ownership, requires a versioned owner-published evidence policy and reviewed clean retained documents, records audited decisions, leaves approved catalogs closed, and requires separate guarded role provisioning. Daily audited driver and merchant document-expiry sweeps use the live policies’ expiry-required kinds; they block new work, preserve active delivery/order fulfillment and return the application to evidence review. Driver reactivation is guarded by Firestore rules. The actual reviewer cannot approve until owner policies contain real requirements. Bank/tax identity, insurance/permit, signed agreements and live partner acceptance remain. No verified partner or business policy has been invented. Evidence: `docs/audit/implementation-2026-10-12.md` and `docs/release/merchant-eligibility.md`. |
| P1-01 | Non-geographic driver offers and assignment. | Partial | Coverage-filtered/proximity-ranked offers, fresh accurate location, fixed nonrenewing 30-second leases, transactional stale-offer rejection and generic push alerts to currently eligible drivers implemented. Refreshes retain active leases ahead of newly discovered work, so polling cannot pin an ignored offer indefinitely; service/zone cursors rotate through ordered 100-booking pages after active offers expire. Paid and `pending_cod` unassigned bookings both enter configured no-partner escalation; paid/COD timeout and no-response reoffer are emulator-covered. Newly available drivers also receive privacy-minimal background alerts for existing eligible work; paginated alert lookup is covered. Tracking requests traffic-aware route durations while quote requests remain traffic-unaware; live Maps behavior/billing, standard central priority/fallback coordination, production-scale load/fairness and native acceptance remain. |
| P1-02 | Foreground-only driver GPS. | Partial | Android foreground location service and explicit server consent implemented; native Java compilation passes. Consent withdrawal clears current coordinates/tracking. iOS live-job location, offline recovery, retention and physical-device acceptance remain. |
| P1-03 | Sensitive operations require documented custom claim reconciliation. | Partial | Current role and active account are required for privileged claim access; booking exception reports now require the active customer, assigned driver, or assigned merchant role, operations resolution requires an active admin record as well as its claim, and legacy bundle migration now requires both the admin role and claim. Revocation/suspension and role-only migration regressions cover these paths. Staff permission matrix/MFA/step-up acceptance remain. |
| P1-04 | Demo records are selectable inside the customer app. | Implemented; sandbox UI acceptance pending | Fixtures removed from live customer app; isolated no-API demo build; release mode/metadata checks and fixture scanner added. |
| P1-05 | Transport custody and liability are incomplete. | Pending implementation + business decisions | RC/authorization uploads, inspection photos, custody acknowledgments, damage/claims, access/retention remain. |
| P1-06 | Money consistency must be checked at every provider boundary. | Partial | Balanced immutable capture/allocation/refund/driver/payout journals, replay safeguards and a paginated journal review implemented. Integer arithmetic guards cover payout reservation/reversal. Complete revenue/tax/merchant allocation, bank reconciliation, invoices and historical balances remain. |
| P1-07 | Booking state model is too generic for complex logistics. | Implemented for Phase 12; live acceptance pending | Six service transition policies and immutable merchant/driver events implemented. Extended to composite TripBundle status derivation (`deriveBundleStatus`) over arbitrary leg combinations, intermediate `at_merchant_stop` en-route detour states, merchant OTP verification (`confirmDetourPickup`), and scheduled fallback dispatch that honors `separatePartnerDeadlineMinutes`, rotates through collection-group pages, checks current ride assignment and policy in a transaction, and preserves already-assigned ride drivers. COD dispatch exceptions can now be reported and resolved, and operations resolution restarts the configured partner search. Emulator regressions cover deadlines, assignment preservation, pagination, COD failure reporting and COD exception resolution; live acceptance remains. |
| P1-08 | Data subject deletion can be split across stores. | Partial | Unique linked mapping and checkpointed Firebase/Neon cleanup helper/worker implemented; publication follows SQL commit. Unlinked deletion migration, retention approval, real staging/export tests and worker scheduling remain. |
| P1-09 | Frontend/backend maintainability concentration. | Partial | Demo, typed rates and feedback separated into modules. Customer/driver/functions concentration, typed adapters and named-route refactor remain. |
| P1-10 | Native and browser delivery needs verified builds. | Partial | Android release now requires signing, registrations, passing preflight and compatible build metadata; CI added. Actual signing, iOS archive/device/store rollout and rollback acceptance remain. |
| P1-11 | COD audit finding: absence of baseline Cash on Delivery policy & risk controls. | Implemented; staging acceptance pending | Audit confirmed no existing COD payment route was previously implemented. COD is now introduced strictly gated behind an active `subscriptions/{uid}` (AllGo Plus), enforced twice server-side (`getBundleQuote` and `confirmBundleCheckout`). Client cannot forge COD eligibility. |
| P1-12 | Trip bundle security & sibling leg privacy. | Implemented; emulator verified | Cross-leg data isolation enforced in Firestore security rules (`bundles/{bundleId}/legs/{legId}`) and callable filters (`listBundleLegOffers`). Drivers see only assigned leg public fields, never sibling OTPs or customer private numbers. Root bundle writes restricted to server. |

## Smaller findings (all report bullets)

| ID | Finding | Status | Work and remainder |
|---|---|---|---|
| P2-01 | `src/components/AdminDashboard.tsx` labels completed **booking value** as **Total Revenue**; this is gross merchandise/booking value, not platform revenue. Show GMV, net revenue, refunds, commission, merchant payable and driver payable separately. | Partial | GMV label corrected; net revenue/refunds/commissions/payables dashboard needs accounting ledger. |
| P2-02 | Driver registration inputs in `src/components/DriverApp.tsx` use white background and `text-white` for license/registration fields; may render unreadable text. Fix contrast and run accessibility checks. | Implemented | Driver registration/support/chat fields now use readable dark text. Hardware/accessibility acceptance still required. |
| P2-03 | `src/components/OperationsConsole.tsx` accepts raw JSON for pricing configuration. Replace with schema-backed, previewable forms, role-aware approvals, versioned publishing, rollback and change history. | Partial | Typed forms, independent operator approval, version concurrency, immutable history and rollback through a new reviewed proposal implemented. Granular staff permissions/MFA and live operations acceptance remain. |
| P2-04 | `server/accounts.mjs` listens on `127.0.0.1` only. That works behind a same-host reverse proxy, but container/PaaS deployment may require a configurable host such as `0.0.0.0`; verify environment/proxy configuration before deploying. | Implemented | ACCOUNT_API_HOST configurable; environment/proxy deployment verification still pending. |
| P2-05 | `PAYMENTS.md` says web payments intentionally do not work, whereas `src/payments.ts` includes Razorpay web checkout and `CustomerApp.tsx` uses it. Reconcile docs with actual product policy and provider review. | Implemented | Documentation matches native/web Razorpay code; actual provider acceptance pending. |
| P2-06 | `functions/index.js` quote is marked claimed before Razorpay order creation; a provider outage can strand a quote. Implement recovery/release and avoid charging twice. | Partial | Payment creation intent and recovery job implemented; real provider/fault testing pending. |
| P2-07 | `src/components/CustomerApp.tsx` uses `window.alert/confirm` in checkout/error paths despite progress toward native-friendly dialogs. Replace with accessible modal/sheet feedback. | Implemented | Customer alert/confirm paths use queued accessible dialog with browser-managed focus. Physical-device acceptance pending. |
| P2-08 | `functions/index.js` operator-managed `operations/settlement.driverShareBps` is a single global percentage. Real products need service-specific rates, distance bonuses, tolls, waiting, cancellations, and versioned settlements. | Partial | Locked per-service versioned base/distance/duration/bounded-waiting/minimum/maximum contracts replace the global percentage. Toll, cancellation and discretionary bonus approval, legacy booking migration and finance acceptance remain. Missing contracts fail closed. |
| P2-09 | No `.github/workflows` paths appear in the 184-file reviewed tree. Add CI for static checks, test suites, environment guards, dependency scans, artifact builds and signed release promotion. | Implemented | CI runs lint, unit/server/security, rules/payment emulator, web build and fixture scan. Signed CI promotion not configured. |
| P2-10 | `package.json` test script runs functions/server tests and secret scan; `test:rules` is separately invoked. Ensure both mandatory suites run automatically in CI. | Implemented | Both normal and emulator suites are mandatory CI steps. |
| P2-11 | Verified Firestore authorization is materially stronger than early versions: default deny; customer cannot forge orders/payments or wallet balances; raw unassigned bookings are not listable by drivers; payment attempts are server-only. Continue testing negative cases, queries, legacy fields and deployed rules. The browser Firebase API key is not, by itself, a server secret. | Partial | New revocation/dispatch/payment negative tests; broader migration/deployed rules acceptance outstanding. |
| P2-12 | Legacy and current data formats need migration versioning (`driver_profiles`, customer addresses, order states, wallet balances and recipient codes). | Partial | Unique identity migration added. New saved-address imports preserve validated delivery metadata and atomically record server-only schema-v2 receipts so SQL checkpoint retries preserve canonical edits/deletions. Historical completed imports, malformed metadata review and comprehensive driver/state/money/code migration remain pending. See production tracker MIGRATION-02 and account lifecycle evidence for validation scope. |
| P2-13 | Add production-grade client offline state, empty/error/loading states for all modules, invalid push link handling, resuming pending checkout, contactless proof, phone interruption and low-memory recovery. | Partial | Food discovery now has distinct loading, empty, no-result and error states, live-record cards, image fallbacks, responsive menu controls and truncated address display. Grocery now separates store/product loading and errors, published-store/catalog empty states, filter misses, stock-empty, closed stores and stale-cart stock conflicts. Ride route entry, recent completed trips and ride tracking use current booking/driver data; malformed server quotes fail closed. Parcel booking now reviews entered package/contact/dimension/date data against the real quote and parcel tracking copy follows booking state. Tracking now rejects malformed, stale and future-dated positions/routes. Shared catalog state/image and quote/status/freshness regression tests and design tokens are added. Address-specific grocery eligibility, parcel evidence/custody/return/claim capabilities, visual/accessibility acceptance and other modules remain pending. Evidence and checks: [`ui-sequence-checklist-2026-10-12.md`](ui-sequence-checklist-2026-10-12.md). |

## Full production checklist

All checklist items below preserve the report requirements. A checked box requires the complete item and independent evidence; none is inferred from compilation.


### P0 platform integrity

- [ ] P0-CHECK-01 Decide and document authority per user/profile/catalog/booking/payment/driver/merchant record.
- [ ] P0-CHECK-02 Verify Neon/Firebase UID bridge, role updates, session revocation, lifecycle, migration and deletion across both stores.
- [ ] P0-CHECK-03 Set staging and production Firebase/Neon resources; assert exact project/database alignment in CI and deploy scripts.
- [ ] P0-CHECK-04 Populate real cities/zones/polygons, merchant catalogs, merchant permissions, delivery prices and settlement contracts.
- [ ] P0-CHECK-05 Test all six service flows end-to-end from signup to signed delivery proof, refunds and settlement.
- [ ] P0-CHECK-06 Configure Razorpay test merchant, webhooks, capture/refund reconciliation and client recovery.
- [ ] P0-CHECK-07 Validate native Google/Apple/phone, Firebase auth, push and App Check on signed devices.
- [ ] P0-CHECK-08 Deliver verified public business info, policies, data disclosures, support channels and acceptance evidence.

### P1 service reliability

- [ ] P1-CHECK-01 Implement distance/zone/capability/freshness-ranked dispatch with offer leases, expiry, reassign and fallback.
- [ ] P1-CHECK-02 Implement compliant consent-based native location collection, staleness handling and map permission recovery.
- [ ] P1-CHECK-03 Enforce service-specific state machines and order events, no invalid jumps or duplicate completion.
- [ ] P1-CHECK-04 Add robust payment/outbox/event jobs: timeout, retry, exactly-once financial effects, dead-letter review.
- [ ] P1-CHECK-05 Protect document/photo PII; implement media access control, object validation, malware scanning and retention.
- [ ] P1-CHECK-06 Verify customer/driver/merchant/admin scoping across Firestore reads, queries, callables and Neon API.
- [ ] P1-CHECK-07 Add incident/failure, out-of-stock, failed pickup, no-partner, return, dispute and reschedule flows.
- [ ] P1-CHECK-08 Add real backup/restore drills; protect PII in logs; audit privileged actions.

### P2 engineering and UX

- [ ] P2-CHECK-01 Break UI monolith into domain screens/hooks/state while preserving routes and saved data.
- [ ] P2-CHECK-02 Replace large functions module with service/policy modules and typed validated contracts.
- [ ] P2-CHECK-03 Replace JSON price editor with typed preview, change approval, rollback and audit.
- [ ] P2-CHECK-04 Replace blocking `alert/confirm`; fix contrast, empty/loading/permission/offline/accessibility and localization.
- [ ] P2-CHECK-05 Add CI workflows: lint, unit, rules emulator, integration, security checks, web builds, native validations.
- [ ] P2-CHECK-06 Add browser + Android + iOS e2e, per-role integration, load, fault injection and data migration tests.
- [ ] P2-CHECK-07 Add observability: SLOs for checkout, dispatch, notifications, location freshness and refund finality; alert on stuck states.
- [ ] P2-CHECK-08 Add documentation of service contracts, database indexes/migrations, permission matrix and on-call runbooks.
- [ ] P2-CHECK-09 Verify signed Android AAB, iOS archive, release keys, app stores, privacy labels, crashes and staged rollout.

### P3 expansion after core operational acceptance

- [ ] P3-CHECK-01 Freight, mini-trucks, pickup loads, moving/packing and fleet operator flow.
- [ ] P3-CHECK-02 Advanced parcel legs, scanner events, return handling and damage claims.
- [ ] P3-CHECK-03 Grocery substitutions/weighted products and bulk inventory sync.
- [ ] P3-CHECK-04 Scheduled rides/food slots, surge/waiting rate policy and advanced service search.
- [ ] P3-CHECK-05 Dispatch optimization, routing batching, performance dashboards and multi-city rollout.

## Required experience inventory

Every experience group is retained for flow-by-flow acceptance; existing source coverage is described in the original audit. Completion requires working implementation and staging/device evidence.


### Customer (shared entry point with service-specific journeys)

- [ ] EXP-CUSTOMER-01 Startup/onboarding; guest discovery policy; signup/login; OTP/email validation; recovery, logout, sessions and device trust.
- [ ] EXP-CUSTOMER-02 Permission center; current location or manually selected city; saved addresses with house/flat/pin/landmark; coverage check; service availability; support fallback.
- [ ] EXP-CUSTOMER-03 Home: services, search, offers, order activity; service catalogs; product variants; allergies; availability; exact fee and ETA explanation.
- [ ] EXP-CUSTOMER-04 Food: cuisines/categories, merchant menus, dietary filters, variants/add-ons, schedule availability, cart, cancellation, restaurant preparation, rider tracking, delivery proof, review, support.
- [ ] EXP-CUSTOMER-05 Grocery: inventory/units, substitutes and final weight, shopping cart, picker/packing status, unavailable item approvals, actual totals/partial refund, substitutions, delivery slot, returns/complaints.
- [ ] EXP-CUSTOMER-06 Parcel: local/intercity, pickup/drop contacts, labels, weight/dimensions/value, restricted goods, pickup slot, route, merchant/courier options, scan/handover, multi-leg, exceptions, lost/damaged, reattempt/return, proof.
- [ ] EXP-CUSTOMER-07 Rides: pickup/stop/drop, vehicle class, luggage/passenger capacity, scheduled pickup, arrival, identity match, OTP start, trip live status, SOS/support, no-show, fare adjustment, final receipt.
- [ ] EXP-CUSTOMER-08 Driver on demand: driver qualification, duration/overtime, identity of customer's vehicle, license requirements, check-in/out inspection, handover/keys, support, damage/incidents.
- [ ] EXP-CUSTOMER-09 Vehicle transport: bike/car type, inspection, weight/dimensions, pickup schedule, ownership documentation, specialist truck choice, loading/photo checks, custody by leg, insurance/terms disclosure, destination acceptance, claims.
- [ ] EXP-CUSTOMER-10 Goods transport/shifting (new domain): mini truck/tempo/pickup/large truck; vehicle volume/load; floors/lift, labor/packers, fragile items, multi-stop, loading equipment, route/time/distance, multi-day, tolls, waiting, damage claims, delivery signoff.
- [ ] EXP-CUSTOMER-11 Payments: verified quotes, UPI/cards/etc per provider eligibility, COD only if operations supports, wallet, coupons, partial/full refunds, failed/pending/repeated payments, downloadable tax invoice.
- [ ] EXP-CUSTOMER-12 Orders: statuses, driver/merchant chat/call privacy, map, notifications, help, cancellation, repeat order, rating, data export, deletion, preferences and support history.

### Driver / fleet partner

- [ ] EXP-DRIVER-01 Validated application, consent, identity and commercial documents, driving license, RC, vehicle photos, permits/insurance where required, review/reject/reapply, bank/UPI setup.
- [ ] EXP-DRIVER-02 Qualification by service and equipment; app online/offline/shift, break, background location consent; geofence; availability/capacity and active-job enforcement.
- [ ] EXP-DRIVER-03 Proximity-ranked time-limited offers, accept/reject/no-response, auto reoffer, navigation, arrival, pickup OTP, parcel scans/photos, transit, delivery OTP/signature, payment collection only when applicable, problem reporting.
- [ ] EXP-DRIVER-04 Emergency and safety workflow, stale location warning, incident reporting, load inspection, vehicle damage records, earnings breakdown, reserves/withdrawals, payout failure, taxes, support, offline/recovery.
- [ ] EXP-DRIVER-05 Fleet operator: multiple drivers/vehicles, capacity, shift roster, dispatch board, specialty equipment verification, vehicle maintenance, route plan and carrier settlement.

### Restaurant / grocery partner

- [ ] EXP-RESTAURANT-01 Business onboarding/KYB, business hours and holidays, bank/UPI, legal and tax data, physical store coverage, delivery slot capacity, roles and staff permissions.
- [ ] EXP-RESTAURANT-02 Catalog CRUD, images/variants, units/allergens, prices, taxes, modifiers, stock, out-of-stock, promotion configuration, availability, import/barcodes and audit trail.
- [ ] EXP-RESTAURANT-03 Order accept/reject with reasons, preparation/picking/packing timing, handover scan/OTP, substitutions, partial refunds and complaints, merchant invoices and settlements, returns and store performance.

### Operations / admin

- [ ] EXP-OPERATIONS-01 Permission-based staff accounts and MFA, onboarding queues, service coverage zones and tariffs with approval/versioning, real-time driver/merchant availability and dispatch map.
- [ ] EXP-OPERATIONS-02 Live orders, stuck states, manual reassign with audit, incidents/emergencies/disputes, cancellation/refund review, fraud/abuse protection, partner and customer suspensions.
- [ ] EXP-OPERATIONS-03 Finance: ledger reconciliation, provider deposits, wallet liability, GMV vs revenue, taxes, commissions, customer refunds, settlements, partner payouts, chargebacks, bank transfer receipts.
- [ ] EXP-OPERATIONS-04 Catalogue quality, promotions, customer support SLAs, performance, data deletion/privacy workflows, alerts, logs, backup/restore, deploy/rollback history and staff audit trails.

### Public web

- [ ] EXP-PUBLIC-01 Service discovery and coverage cities; partner application; installation links; order lookup only with authentication; help/contact; policies and terms; accessible customer web checkout where provider/platform allows; separate secured merchant/admin web domains.

## Release gates

- [ ] Gate A — Configuration: independently verified staging/production projects, exact DB IDs, secrets, billing, provider URLs, webhook signing, environment guard, service pricing and legal policy URLs.  
- [ ] Gate B — Authorization: 4+ roles, every sensitive route/collection, role revocation, linked token expiry, unassigned offers, private addresses, wallet/financial records, admin claims, abuse controls and App Check checked in emulator and staging.  
- [ ] Gate C — Money: Razorpay signed test transactions; duplicate/delayed webhook; payment retry; no double booking; inventory concurrency; coupon concurrency; partial/full refund; wallet debt; provider-to-ledger reconciliation; real payout record.  
- [ ] Gate D — Fulfillment: all service states and exceptions; two-party/three-party tests; real location, ETA, offline/background, chat, emergency contact, pickup/delivery proof, tracking and abandoned booking recovery.  
- [ ] Gate E — Mobile: physical Android and iPhone device matrix, battery/location/notification permissions, app killed/reopened, cellular changes, deep links, login session restores, camera/media upload, signed builds.  
- [ ] Gate F — Operations: staffed support, partner onboarding evidence, no-driver escalation, failed refund queues, merchant/driver payout reconciliation, backups/restore, metrics and on-call ownership.  
- [ ] Gate G — Release: CI passing, staged deployment, canary rollout, signed store packages, verified listings and privacy disclosures, independent operator approval, rollback playbook.

## Verification

Record actual completed runs here after the final changes. Isolated emulator tests do not access production data. Cloud deployment, provider transactions, native signing, hardware journeys, backups and store submissions have not been performed.

