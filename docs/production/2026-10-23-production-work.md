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

The user's provider choice is Firebase/Google. The existing repository and local development settings identify `promtwars222`. Read-only Firebase CLI project inventory confirms this project is accessible; its display name is StadiumOps. Initial app inventory identified AllGo Customer Android and AllGo Web; a Windows CLI shutdown assertion was retained in diagnostics. Subsequently registered the missing AllGo Merchant and Delivery Android apps in that configured project and successfully downloaded/validated all three Android SDK configurations. Actual IDs and package names are recorded in `FIREBASE_ANDROID_REGISTRATIONS_2026-10-23.json`. Matching ignored local Google Services files were installed for the canonical project and both standalone partner projects; prior files are backed up under `.cache/firebase-android-config`. No existing database, provider settings, billing settings or hosted backend was changed. Production environment separation, release certificate bindings, Google OAuth/provider acceptance and iOS registration remain open.

The actual production/staging designation and deployed HTTPS account API were not supplied by the provider-name answer. Existing development resources were not silently promoted to production. Inventory logs: `.cache/production-firebase-projects.json`, `.cache/production-firebase-apps.json`.

## Verified repair: grocery substitution reservation lifecycle

Replacement proposals reserve candidate stock in addition to the original order reservation. Fixed acceptance/removal to return the original reservation exactly once, and cancellation to return both reservations while a proposal is pending. Removed lines do not generate invented stock returns. Cancellation racing the expiry worker is transactional and cannot double-restock a candidate.

Packing another order line now preserves substitution metadata. Expiry is bound to the proposal revision rather than assuming no other line was packed; it advances the current order revision safely. Customer decisions delete the exact proposal expiry record even when another line changed the overall revision. Expired replacement products cannot be accepted.

All **162** Firebase/rules/integration tests pass, including four new cancellation/expiry/other-line races and original-stock assertions on replacement acceptance/removal. Final application suites pass **78 Functions + 156 UI + 116 server = 350 tests**, with secret scan passing. Logs: `.cache/production-inventory-rules.log`, `.cache/production-inventory-tests.log`. These backend-only fixes were synchronized into both partner folders; backup manifest `.cache/partner-workspace-sync/0a57e68a-ec56-4dfa-9320-a43146ac80d7/manifest.json`; parity check reports zero differences.

Historical or manually corrupted stock was not retroactively rewritten; existing stock-event history and operator reconciliation remain authoritative. No money-policy, tax, commission or retention agreement was invented.

## Verified Firebase Android identity configuration

Created AllGo Merchant Android (`in.allgo.merchant`) and AllGo Delivery Android (`in.allgo.delivery`) registrations in the user's configured accessible project `promtwars222`. Reused the existing customer registration. Downloaded SDK configurations with `firebase apps:sdkconfig ANDROID <appId> --project promtwars222 --out <local-file>` and validated project ID, Firebase app ID and package name before writing ignored native config files. Exact app IDs are in `FIREBASE_ANDROID_REGISTRATIONS_2026-10-23.json`; no API keys or private credentials are in that report.

Rebuilt all three APKs sequentially with those configurations. The package ID, embedded audience and the matching Firebase app ID in `resources.arsc` all verify. Latest hashes are in `ANDROID_ARTIFACTS_2026-10-23.json`; logs `.cache/production-firebase-{customer,merchant,driver}-android.log`. Firebase App Check/Auth/Messaging native plugins are included; this does not prove runtime provider success.

SDK output has no Google OAuth client entries. Google provider/consent configuration, debug and release signing-certificate enrollment, phone/SMS provider acceptance, App Check and actual native login remain required. Registering Android app identities and downloading SDK configuration does not enable or verify Google sign-in. No existing authentication provider was disabled or changed.

## Remaining work and release boundaries

- Separate merchant/delivery shared runtimes were synchronized and both standalone workspaces passed TypeScript and development web builds. The reproducible sync command, exact scope and backups are documented in `PARTNER_RUNTIME_SYNC.md`. Android packaging verification is recorded there.
- COD grocery substitutions currently require prepaid orders; cash-specific replacement/removal accounting remains separate from quantity confirmation.
- Physical cash remittance, merchant settlement allocation, real bank identity and tax/invoice rules require reviewed operational/accounting agreements; collection journals do not establish remittance or verified merchant payouts.
- Transport custody/inspection/claims and parcel photo proof need published consent, access and retention policy; do not invent owner policy or enable collection without it.
- Fresh staging and production preflight checks both fail closed for missing real provider/project/database/API/legal/signing/acceptance setup. Values are omitted in `.cache/production-staging-preflight.log` and `.cache/production-release-preflight.log`. No acceptance record was fabricated.
- Authenticated native participant journeys, real SMS/maps/payment/push acceptance, signed releases and iOS verification remain open. New device startup was attempted but blocked by AVD lock/disk/Windows commit limits; exact observations are in `PARTNER_RUNTIME_SYNC.md`.

The original production remediation register remains open wherever its actual implementation or acceptance is missing. This checkpoint is not a production-readiness declaration.
