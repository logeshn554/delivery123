# Production implementation checkpoint — 2026-10-23

The user has authorized continuing from independent delivery-platform requirements. Reference APK analysis is no longer a prerequisite. Historical Swiggy declarations remain historical evidence; no new implementation is attributed to proprietary code.

## Verified repair: ordinary cash-on-delivery transactions

Reproduced a live code-path blocker: COD creation and collection referenced `customer_receivable_cod` / `cash_in_hand_driver`, which the journal validator did not permit. Previous wallet/provider journeys did not exercise COD, so passing tests missed this failure.

Implemented the two explicit ledger accounts, retry-safe concurrent allocation, integer-pa ise amount checks and the existing ₹2,000 limit on every attempt/recovery. Persisted checkout retries must retain customer, service and amount. An over-limit saved attempt cannot bypass the cap on a second request. Cash completion now updates the payment attempt in the same transaction as the booking, cash journal and driver earning; repeated recipient-code completion cannot duplicate earnings or collection.

Pending cash orders can be cancelled by their customer or rejected by their assigned merchant. The transaction restores reserved grocery stock once, clears confirmation codes, reverses the unpaid receivable and records cancellation; it never credits a wallet or asks a payment provider for a refund. Customer, merchant and payment-activity interfaces disclose the cash-specific result. Grocery quantity confirmation accepts valid pending COD orders. Concurrent cancellation/merchant acceptance commits one outcome.

Cash checkout reuses its request ID for identical retries while the customer screen remains mounted. Payment activity provides owner-scoped recovery from the saved intent through `recoverCodBooking`, independent of Razorpay; a restart does not require inventing another payment attempt. Same-screen request-ID retention is not a claim of durable client storage across app reinstalls.

Verification: 77 Functions tests, 156 UI tests, 116 server tests and secret scan passed; TypeScript passed. All **158** isolated Firestore/rules/payment/bundle/evidence tests passed after the new COD journey exposed and fixed the prepaid-only grocery packing guard. Both cash and wallet customer → merchant → dispatch → recipient-confirmation journeys are covered for food/grocery; ride, parcel, driver-hire (`takeover`) and transport quote/pickup/completion journeys are covered for both methods. Maps is replaced only at the external-provider boundary in these tests. Live provider or physical-cash acceptance is not established.

Logs: `.cache/production-cod-tests.log`, `.cache/production-cod-rules.log` (initial failure), `.cache/production-cod-rules-final.log` (158/158). No production backend was deployed.

## Remaining work and release boundaries

- Separate merchant/delivery folders contain stale shared runtime copies, including older identity/session protections; synchronize only the shared source with backups while preserving app identity/configuration/native projects, then verify each workspace.
- COD grocery substitutions currently require prepaid orders; cash-specific replacement/removal accounting remains separate from quantity confirmation.
- Physical cash remittance, merchant settlement allocation, real bank identity and tax/invoice rules require reviewed operational/accounting agreements; collection journals do not establish remittance or verified merchant payouts.
- Transport custody/inspection/claims and parcel photo proof need published consent, access and retention policy; do not invent owner policy or enable collection without it.
- Fresh staging and production preflight checks both fail closed for missing real provider/project/database/API/legal/signing/acceptance setup. Values are omitted in `.cache/production-staging-preflight.log` and `.cache/production-release-preflight.log`. No acceptance record was fabricated.
- Authenticated native participant journeys, real SMS/maps/payment/push acceptance, signed releases and iOS verification remain open.

The original production remediation register remains open wherever its actual implementation or acceptance is missing. This checkpoint is not a production-readiness declaration.
