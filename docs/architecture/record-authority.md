# Record ownership and identity contract

Recovered 2026-10-19 from pre-integration commit `d87fda6` after branch cleanup removed this audit-linked contract. Reviewed against `server/schema.sql`, `server/firebaseIdentity.mjs`, `server/deletionCoordinator.mjs` and the deletion callables. Current validation limits are in [release readiness](../production/RELEASE_READINESS.md).

Neon owns email credentials, verified email, account sessions and credential recovery. `allgo_identity_links` is the unique account-to-Firebase UID mapping; the JSON `firebaseUid` is a legacy migration source. Firebase owns the service profile, staff/partner roles, catalog, pricing, coverage, canonical bookings, fulfillment events, finance, tracking and service support after identity connection. Client identifiers and roles are never accepted as authority.

`allgo_bookings` and `allgo_catalog` are legacy tables, not a second fulfillment backend. They must not receive new payments or bookings. Export and migrate legacy records only under an operator-approved migration plan. Never import a legacy JSON `paid` flag into the canonical payment ledger.

The bridge requires a verified Neon email and an active matching Firebase account. Creating service profiles always starts with customer role and zero balance. Partner/admin roles are assigned server-side; an admin token also requires an active admin database role. Role revocation immediately denies privileged Firestore access, even before an old token expires. Bridge session documents bind the Firebase token to the unexpired Neon session. Logout removes that link before deleting the SQL session.

Service profile edits after connection use Firebase; Neon account names are pre-connection display data. Credentials and email ownership remain in Neon. Profile export must include both account and service data; acceptance must confirm canonical UID consistency on all linked journeys.

Deletion is checkpointed: requested → processing → firebase_completed (linked accounts) → completed. Firebase cleanup stores the Neon mapping in the deletion job. The trusted worker verifies that mapping in SQL, revokes sessions, removes personal records, and retains a tombstone plus legacy finance amounts. Only after SQL commit does it publish completion. Failed publication can retry safely. Financial/legal retention and backup deletion require the owner's published retention policy; no deletion job is run as part of source remediation.

Acceptance still required: signup, verification, linking an existing verified identity, concurrent linking, profile edits, role promotion/revocation, logout, password reset, expiry, exports and dual-store deletion in isolated staging.

Deletion retry preserves the recorded Neon mapping after the Firebase user document is removed. Both deletion stages independently check assigned active bookings in addition to driver-profile pointers; in-progress jobs cannot be claimed by another operator. Interrupted-worker recovery and deployed dual-store behavior still require acceptance.
