# Service contracts and operations reference

Related contracts: [record ownership and identity](../architecture/record-authority.md) and [proposed goods/movers domain](../architecture/goods-and-movers.md). The latter remains an unimplemented expansion requiring owner decisions and acceptance.

Updated 2026-10-18. This document describes the repository source as checked in; it is not proof that Firebase rules, indexes, schedules, providers, IAM, or native integrations are deployed. Release operators must verify the deployed project and use the release gates in [RELEASE_READINESS.md](RELEASE_READINESS.md).

Deletion retry identity (2026-10-19): the deletion job retains its recorded Neon account ID when a failed Firebase cleanup is retried after removing `users/{uid}`. A linked job must remain `firebase_completed` until the SQL coordinator commits its cleanup and publishes `completed`. A job still in `processing` cannot be claimed by another operator; investigate a terminated worker before authorizing recovery. This source behavior does not establish deployed cross-store acceptance.

Deletion custody guard (2026-10-19): request and processing independently query assigned nonterminal bookings, so a missing driver-profile active-job pointer does not permit deleting an account with an active delivery. Resolve custody through the supported fulfillment/incident workflow before retrying deletion.

Deletion also checks nonterminal bookings for the account's bound merchant ID. Finish or resolve the restaurant/grocery queue before removing its merchant operator. The query requires the `bookings(merchantId,status)` composite index to be deployed.

## Service lifecycle contracts

The canonical callable transitions are implemented in `functions/fulfillmentPolicy.js`, `functions/index.js`, and `functions/tripBundleFunctions.js`. Booking documents are server-created and client writes to bookings and booking events are denied by `firestore.rules`.

| Service | Customer/merchant preparation | Driver assignment and custody | Completion evidence |
|---|---|---|---|
| Food | Merchant moves `pending → preparing → ready`; only `ready` is dispatchable. | Eligible driver accepts to `accepted`, then reports pickup arrival (`preparing`) and pickup (`transit`). | Recipient code is required to complete. |
| Grocery | Merchant moves `pending → preparing → ready`; substitution proposals require customer resolution or expiry handling. | Eligible driver accepts to `accepted`, then reports pickup arrival (`preparing`) and pickup (`transit`). | Recipient code is required. Expired substitution reservations are released by the scheduled worker. |
| Ride / driver hire (`takeover`) | No merchant preparation stage. A `pending` booking is dispatchable. | Driver accepts, reports pickup arrival, and confirms trip start with the pickup code before `transit`. | Recipient code is required to complete. |
| Parcel / vehicle transport | No merchant preparation stage. A `pending` booking is dispatchable. | Driver accepts, reports pickup arrival, and confirms handoff with the pickup code before `transit`. | Recipient code is required. Photo proof is not implemented; do not treat a synthetic fixture as delivery evidence. |
| Trip bundles | Bundle legs are server-managed; leg transitions and assignment are enforced by bundle callables and per-leg policies. | Assignment and chat access are scoped to the corresponding leg and current participant role. | Bundle and leg refund/cancellation rules are separate from single-booking rules. |

Unknown service types and invalid transitions fail closed. An open booking exception blocks progression until an active operations account resolves it. A cancellation or refund review is not the same as successful delivery. See `functions/bookingExceptions.js`, `functions/refundPolicy.js`, `functions/perLegRefundPolicy.js`, and `functions/bundleRefunds.js` for exact checks.

## Authorization and data access

The table summarizes the direct Firestore/Storage boundary in `firestore.rules` and `storage.rules`. Callable commands perform additional checks; callers must not infer permission from a screen being visible.

| Data | Customer | Driver | Merchant | Admin / operations |
|---|---|---|---|---|
| Own account and addresses | Read own; limited profile/address edits. Role, wallet, authority and identity-link fields are server-controlled. | Read own; no self-approval or earnings/assignment mutation. | Read own; merchant identity is server-controlled. | Read/list; the rule permits direct user-document deletion, but account lifecycle cleanup must use the server workflow. |
| Bookings and events | Read own bookings. | Read only assigned bookings when verified. Unassigned dispatch is through server offer commands. | Read only bookings for the linked merchant and service type. | Read bookings; writes remain callable/server-only. |
| Tracking and contact details | Read own booking tracking/contact data. | Read only assigned booking details when verified. | No direct access to private driver/customer contact or tracking documents. | Read through authorized operations paths. |
| Driver profile and eligibility | No access to another account's profile. | Read own; may toggle online state and edit unverified application fields under rules. Verification, earnings, assignment, approved capabilities, consent changes, and raw location writes use server commands. | No access. | Read profiles; changes use server commands; eligibility writes are server-only. |
| Partner applications/evidence | Applicant reads own records. | Applicant reads own records. | Applicant reads own records. | Read records directly; review through role-checked server commands. Evidence objects are private; client Storage reads and writes are denied. |
| Payment attempts, refund events, journals | No direct reads; own history is returned by a scoped callable. | No access. | No access. | Financial review callables require operations authorization; raw writes are server-only. |
| Wallet/driver ledger | Read own ledger; no direct writes. | Read own ledger; no direct writes. | No access. | Read for reconciliation; writes are server-only. |
| Bundles and legs | Read own bundle and legs. | Read own assigned legs. | Read own assigned merchant legs. | Read and administer through authorized server commands. |
| Support cases | Read own cases/messages/events. | Read own cases/messages/events. | Read own cases/messages/events. | Read/review via server commands; direct client writes are denied. |

Sensitive callable authorization generally requires a valid Firebase identity and active account. Neon-linked identities also require an unexpired `allgoSession` bridge record. Admin commands require both the admin custom claim and an active account with `role == admin`; the exact check varies by command and is covered by callable tests. Firestore and Storage rules have a default-deny catch-all. These are source claims; deployed claim propagation, App Check, and provider acceptance remain release gates.

## Persistence, indexes, and migrations

- `firestore.rules` defines the client access boundary. `storage.rules` denies all direct client object access; private evidence access is mediated by server callables.
- `firestore.indexes.json` contains composite indexes for booking dispatch/listing, payment activity/reconciliation, driver eligibility queries, partner evidence scanning, bundle legs/refunds, and related scoped reads. New compound queries must update this file and be tested in the Firestore emulator before deployment. This file does not prove indexes are deployed.
- `server/schema.sql` is the relational base schema for `allgo_accounts`, sessions, identity links, account items, catalog, bookings, password resets, rate limits, and email verification. It includes uniqueness constraints for verified phone and one review per order. It is not a numbered migration history; inspect the target database before applying schema changes.
- Cross-store identity and saved-address import behavior is implemented in the server account API and import callables. New imports use server-only receipts for replay safety. Historical completed imports without receipts remain an operator-reviewed reconciliation task; do not reset their SQL checkpoints automatically.
- Avoid editing financial or fulfillment records directly in the console. Use the idempotent callable or recovery path, then reconcile provider evidence and the corresponding ledger/journal before closing an incident.

## Operational recovery procedures

These procedures are source-level guidance. Before acting, confirm the exact staging/production project, current operator authorization, and incident change record. Do not use production customer data in local or test environments.

| Symptom | Safe investigation and recovery path | Escalate / do not do |
|---|---|---|
| Checkout is pending or the client lost its response | Confirm the customer/order identity through the scoped activity view. Use `recoverPayment` for the customer-owned attempt; the scheduled `reconcileCheckoutIntents` worker also checks recoverable intents. Verify provider order/payment evidence and the booking/payment attempt/journals before declaring final. | Do not create a second charge, mark an attempt paid manually, or infer payment from a client callback. Unmatched/ambiguous provider orders require financial review. |
| Refund remains processing/required | Inspect the scoped pending-refund queue and provider evidence with `listPendingRefunds` / `reviewPendingRefund`. `reconcilePendingRefunds` checks provider state and checkpoints work. Reconcile cumulative provider refund amounts against attempt, booking, wallet, and journal records. | The scheduled checker does not issue a new refund. Never retry a provider refund merely because the previous response timed out; uncertain or mismatched evidence requires finance review. |
| Booking has no driver or is stuck after an offer | Check booking status, current driver eligibility/location consent/freshness, service zone/capability, live offer lease, exception state, dispatch policy version, and `dispatch_recovery_failures`. `escalateUnassignedBookings` retries queued transient failures and applies configured no-partner policy. | Do not invent service priorities or force-assign a driver. A sustained retry queue needs an assigned operations owner and incident review; deployed schedule behavior is not yet verified. |
| Grocery replacement reservation did not release | Verify substitution status/revision/expiry and stock movement records. The scheduled `expireGrocerySubstitutions` worker releases due reservations and rotates through pages. | Do not edit stock totals directly or accept an expired customer choice. Investigate inventory ledger consistency before repair. |
| Partner evidence is unavailable or stuck in quarantine | Verify application ownership, evidence status/revision, scan outcome, storage object metadata, and scanner health. The scheduled scanner rechecks eligible evidence; access is mediated by `downloadPartnerEvidence`. Expired evidence cleanup is scheduled and retryable. | Do not share bucket URLs, bypass a failed scan, or approve an unclean object. Production bucket/IAM/scanner acceptance is still open. |
| Account deletion is pending | Verify the authenticated request and `account_deletions` status. `requestAccountDeletion` records the request; `processAccountDeletion` performs server-side cleanup and cross-store lifecycle handling. Preserve audit evidence and follow the published retention policy. | Do not delete linked Firebase/Neon records out of band or promise completion before both stores and device cleanup are reconciled. Retention and legal policy approval remain open. |
| Driver location or push stopped | Check current account/eligibility, explicit location/push consent, provider registration ownership, last successful location/token update, device permissions, and native logs. Re-enable only through the account's explicit consent flow. | A local stop does not prove server-side consent withdrawal. Offline unregister, process-death recovery, and real-device provider behavior still require acceptance. |

## Operational readiness gaps

The repository does not yet establish production SLO targets, alert thresholds, staffed on-call ownership, or a verified backup/restore drill. Owners must define checkout finality, dispatch assignment latency, refund age, notification delivery, and location freshness objectives before alert thresholds are configured. No production deployment or external customer action is authorized by this source reference.
