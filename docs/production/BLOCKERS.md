# Blockers and required setup

Updated 2026-10-17. Continue unblocked source and emulator work; blockers do not justify marking features complete.

| Blocker | Evidence | Exact next requirement |
|---|---|---|
| Authenticated Android acceptance | Pixel_8 recovered; all three apps install/launch and public recovery/welcome render, but configured account endpoint is unreachable and native provider registrations are absent | Supply an isolated reachable account/service backend and native registrations, then verify role workflows, logout, location and notification taps |
| Remaining reference journeys | REA now captures out-of-coverage home and location selector; other journeys unobserved | Continue normal browsing in a supported location; stop at protected surfaces without bypass |
| Staging/provider acceptance | Existing release/audit gates document absent accepted configuration | Run check-release staging; supply real isolated Firebase/Neon registrations, identity bridge, Maps, push, Razorpay test/webhook secrets and test catalogs/coverage |
| Business operations | Existing eligibility and release policies unaccepted | Owner-published eligibility, retention, legal/refund policies, support ownership, real service zones and settlement contracts |
| iOS execution | Windows host | macOS/Xcode, registered iOS Firebase app, signing and test device/simulator |
| Store release | No current signed acceptance evidence | Valid signing plus tested gates A–G, rollout/rollback and operator review |

Credentials belong in ignored local configuration or managed secrets, never source or reports. Configuration checks must remain fail-closed. No production purchases, onboarding approvals, deployments or customer data changes have been performed.

Saved-address migration reconciliation remains open. Previously completed migrations have no receipts and may have lost delivery metadata; do not reset their SQL checkpoints automatically, because canonical edits/deletions cannot be inferred from stale SQL. New imports use server-only receipts to protect replay after partial cross-store failures. Malformed legacy metadata is classified needs_review, not silently accepted. An operator-reviewed inventory, retention treatment and reconciliation tool are still required before claiming full migration acceptance.

API-reported account expiry now invokes native cleanup in source, with controlled-runtime coverage. Acceptance still needs actual plugins/devices, expiry detection while using only Firestore or while idle/backgrounded, in-flight push-enable/refresh race handling, offline server registration/consent reconciliation and recovery from failed native/secure-store operations across restart. Do not treat a stopped local location service as proof of server-side consent withdrawal after expired authorization.

Notification opt-in/refresh race protection is now implemented and controlled-runtime tested. Real native Firebase timing, SDK hangs during teardown drain, process death/restart, offline unregister/consent reconciliation and secure-storage/plugin failure recovery still require device/provider acceptance. Ownerless legacy local push flags no longer auto-register; users must explicitly re-enable from their current account.
