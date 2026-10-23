# Production implementation checkpoint — 2026-10-23

The user has authorized continuing from independent delivery-platform requirements. Reference APK analysis is no longer a prerequisite. Historical Swiggy declarations remain historical evidence; no new implementation is attributed to proprietary code.

## Verified repair: ordinary cash-on-delivery transactions

Reproduced a live code-path blocker: COD creation and collection referenced `customer_receivable_cod` / `cash_in_hand_driver`, which the journal validator did not permit. Previous wallet/provider journeys did not exercise COD, so passing tests missed this failure.

Implemented the two explicit ledger accounts, retry-safe concurrent allocation, integer-paise amount checks and the existing ₹2,000 limit on every attempt/recovery. Persisted checkout retries must retain customer, service and amount. An over-limit saved attempt cannot bypass the cap on a second request. Cash completion now updates the payment attempt in the same transaction as the booking, cash journal and driver earning; repeated recipient-code completion cannot duplicate earnings or collection.

Pending cash orders can be cancelled by their customer or rejected by their assigned merchant. The transaction restores reserved grocery stock once, clears confirmation codes, reverses the unpaid receivable and records cancellation; it never credits a wallet or asks a payment provider for a refund. Customer, merchant and payment-activity interfaces disclose the cash-specific result. Grocery quantity confirmation accepts valid pending COD orders. Concurrent cancellation/merchant acceptance commits one outcome.

Cash checkout reuses its request ID for identical retries while the customer screen remains mounted. Payment activity provides owner-scoped recovery from the saved intent through `recoverCodBooking`, independent of Razorpay; a restart does not require inventing another payment attempt. Same-screen request-ID retention is not a claim of durable client storage across app reinstalls.

Verification: 77 Functions tests, 156 UI tests, 116 server tests and secret scan passed; TypeScript passed. All **158** isolated Firestore/rules/payment/bundle/evidence tests passed after the new COD journey exposed and fixed the prepaid-only grocery packing guard. Both cash and wallet customer → merchant → dispatch → recipient-confirmation journeys are covered for food/grocery; ride, parcel, driver-hire (`takeover`) and transport quote/pickup/completion journeys are covered for both methods. Maps is replaced only at the external-provider boundary in these tests. Live provider or physical-cash acceptance is not established.

Logs: `.cache/production-cod-tests.log`, `.cache/production-cod-rules.log` (initial failure), `.cache/production-cod-rules-final.log` (158/158). No production backend was deployed.

## Shared applications and artifacts

Synchronized 131 shared runtime files into each standalone merchant/delivery workspace, with per-file backups and hashes. Both standalone TypeScript and development web builds passed. All three canonical Android debug builds passed; package/audience/identity and artifact hashes were verified. The root workspace was returned to the customer bundle/native assets afterward. See `PARTNER_RUNTIME_SYNC.md` and `ANDROID_ARTIFACTS_2026-10-23.json`.

The user's provider choice is Firebase/Google. The existing repository and local development settings identify `promtwars222`. Read-only Firebase CLI project inventory confirms this project is accessible; its display name is StadiumOps. App-inventory output identifies an active AllGo Customer Android registration (`in.allgo.app`) and AllGo Web registration. The Windows CLI subsequently emitted a libuv shutdown assertion, so that app inventory is retained as partial diagnostic output, not deployment acceptance. Merchant/delivery/iOS release registrations and production environment separation still require verification. No project, app registration, provider setting, database, billing setting or hosted resource was changed.

The actual production/staging designation and deployed HTTPS account API were not supplied by the provider-name answer. Existing development resources were not silently promoted to production. Inventory logs: `.cache/production-firebase-projects.json`, `.cache/production-firebase-apps.json`.

## Remaining work and release boundaries

- Separate merchant/delivery shared runtimes were synchronized and both standalone workspaces passed TypeScript and development web builds. The reproducible sync command, exact scope and backups are documented in `PARTNER_RUNTIME_SYNC.md`. Android packaging verification is recorded there.
- COD grocery substitutions currently require prepaid orders; cash-specific replacement/removal accounting remains separate from quantity confirmation.
- Physical cash remittance, merchant settlement allocation, real bank identity and tax/invoice rules require reviewed operational/accounting agreements; collection journals do not establish remittance or verified merchant payouts.
- Transport custody/inspection/claims and parcel photo proof need published consent, access and retention policy; do not invent owner policy or enable collection without it.
- Fresh staging and production preflight checks both fail closed for missing real provider/project/database/API/legal/signing/acceptance setup. Values are omitted in `.cache/production-staging-preflight.log` and `.cache/production-release-preflight.log`. No acceptance record was fabricated.
- Authenticated native participant journeys, real SMS/maps/payment/push acceptance, signed releases and iOS verification remain open. New device startup was attempted but blocked by AVD lock/disk/Windows commit limits; exact observations are in `PARTNER_RUNTIME_SYNC.md`.

The original production remediation register remains open wherever its actual implementation or acceptance is missing. This checkpoint is not a production-readiness declaration.
