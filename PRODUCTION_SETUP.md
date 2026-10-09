# Production setup and recovery

## Environments and authorization

- Use distinct Firebase projects and native registrations for staging and production. Set all `VITE_FIREBASE_*` values before the web build and `FIRESTORE_DATABASE_ID` in server environment configuration. The booking event trigger uses the same database variable. Never use a live-reload server in a release build.
- Email addresses no longer grant operations privileges. Run `node functions/provisionRole.js --project=PROJECT --database=DATABASE --uid=REGISTERED_UID --role=admin` for a dry run; add `--apply` only for the approved operator. It preserves other claims, assigns the profile role and revokes refresh tokens. Merchant assignments additionally require actual `--merchant-id` and `--merchant-type`. No roles are provisioned automatically.
- Customers cannot change roles, business bindings, wallet balances or partner earnings. Client booking/payment/ledger writes are denied; authorized callables perform lifecycle and financial transactions. Partner identity documents are private. Legacy recipient codes must be migrated before opening dispatch.

## App Check and abuse controls

Callables use per-account/per-endpoint minute limits with two-minute rate-record expiration, bounded instances and sanitized server errors. Native phone SMS quotas and abuse protection must also be configured in Firebase Authentication. Set `REQUIRE_APP_CHECK=true` only after registering the actual Android Play Integrity and iOS App Attest/DeviceCheck providers in Firebase and setting `VITE_APP_CHECK_ENABLED=true` in the native build. The installed App Check plugin supplies tokens to the JavaScript SDK CustomProvider so callable headers include attestation. Web builds additionally require `VITE_APP_CHECK_SITE_KEY` for reCAPTCHA Enterprise. Debug attestation is allowed only in development builds and must never be used in distributed production. Until that deployment step, authentication and rate limits apply but App Check is not enforced; production release must not claim it is active.

## Retention and monitoring

Configure Firestore TTL policies on `rate_limits.expiresAt`, `service_quotes.expiresAt` and `push_devices.expiresAt`. TTL is asynchronous. Do not expire unresolved payment attempts: reconcile them first. Configure financial retention from the operator's published policy rather than deleting financial evidence automatically. Schedule reconciliation for captured-but-unfulfilled payments and refunds requiring review. Use payment activity recovery for owner-initiated reconciliation; unresolved provider errors remain visible rather than creating a successful order.

Create Cloud Logging alerts for callable internal failures, Razorpay webhook failures, notification retry errors and account deletion failures. Track refund-required counts, provider callback latency, failed payment settlements, stale partner locations and requested payouts. Never log tokens, OTPs, raw provider signatures, addresses or license documents. A notification trigger can be redelivered; collapse identifiers reduce duplicate presentation, but delivery is not exactly once.

## Deployment sequence

1. Configure actual project/database, Secrets Manager values, provider settings and native registrations.
2. Review role provisioning and legacy recipient-code migration dry runs. Reconcile existing nonzero balances against actual ledger opening records.
3. Deploy functions, rules and indexes together under the intended project after approval. Wait for indexes before live flows.
4. Configure webhook URL/signature secret, Google API restrictions/billing, private coverage/rates and approved wallet/offer/privacy policies.
5. Exercise staged accounts, provider test payments, webhook duplicates, stock/coupon/wallet races, cancellation/refunds, partner settlement, deletion and phone permission interruption before enabling production operations.
6. Monitor after rollout. For rollback, disable new funding/service acceptance through configuration, retain financial records, restore the previous compatible client/functions and reconcile in-flight payments. Never roll rules back to email-based admin or public OTP/location access.

No cloud configuration, provider request, migration or deployment is performed by these source changes.
