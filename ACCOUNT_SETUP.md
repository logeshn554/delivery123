# Wallet, offers and account privacy

## Wallet

Funding/spending are disabled unless `platform_config/wallet` contains `enabled: true` and a positive integer `maxTopupCents`. Operations must approve the product and provider setup before enabling it. Existing nonzero balances require reconciliation against actual opening ledger entries before enabling spending; do not seed credits.

Funding uses Razorpay capture verification and the same recovery/webhook pipeline. `wallet_ledger/{uid}/entries` is private and server-written. Bookings debit in the inventory/fulfillment transaction. Eligible cancellations credit the original debit once. Transaction values are integer paise, displayed as rupees. Wallet checkout has a request identifier for retries. Internal wallet charges are not provider payments.

## Offers

Create only actual approved offer documents in `coupons/{UPPERCASE_CODE}` using Admin SDK: `enabled`, `expiresAt` Firestore Timestamp, `serviceTypes` array, `minAmountCents`, `maxRedemptions`, `redeemedCount` (zero initially). Use `type: fixed` plus `discountCents`, or `type: percent` plus `percentBps` and `maxDiscountCents`. Optional `eligibleUserIds` restricts eligibility. One redemption per account; cancelled orders do not restore eligibility. The server rechecks expiry/quota at fulfillment. No public listing exposes private eligibility lists. Cart checkout and service fare requests support explicit code entry.

## Deletion and retention

Publish a real privacy/retention policy and configure `platform_config/privacy` with `deletionEnabled: true` and `policyUrl` containing its HTTPS URL. Customers request deletion after recent sign-in; operations processes the request in the dashboard. Active journeys, unresolved checkout/refund attempts and balances block processing. Review abandoned created payment attempts against provider records before clearing them; do not mark unpaid without reconciliation.

The server disables/revokes authentication, erases profile/address/device data, partner identity data, chats, recipient codes, tracking and service quotes, and removes customer contact/journey content from retained bookings/payment attempts. Financial amounts, ledger and provider references remain under the configured operator retention policy. Processing status is recorded and retryable. Operators must configure retention expiration for financial records separately. Data exports are handled through support; automated export remains pending.

## Acceptance

Requires deployed functions/rules/indexes, actual provider test funding, duplicate callbacks, simultaneous wallet spending, stock failures, cancellation replay, real offer eligibility/quota races, and a deletion exercise on an approved disposable account. None of these actions is simulated in the application.
