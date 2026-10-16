# Blockers and required setup

Updated 2026-10-16. Continue unblocked source and emulator work; blockers do not justify marking features complete.

| Blocker | Evidence | Exact next requirement |
|---|---|---|
| Remaining reference journeys | REA now captures out-of-coverage home and location selector; other journeys unobserved | Continue normal browsing in a supported location; stop at protected surfaces without bypass |
| Staging/provider acceptance | Existing release/audit gates document absent accepted configuration | Run check-release staging; supply real isolated Firebase/Neon registrations, identity bridge, Maps, push, Razorpay test/webhook secrets and test catalogs/coverage |
| Business operations | Existing eligibility and release policies unaccepted | Owner-published eligibility, retention, legal/refund policies, support ownership, real service zones and settlement contracts |
| iOS execution | Windows host | macOS/Xcode, registered iOS Firebase app, signing and test device/simulator |
| Store release | No current signed acceptance evidence | Valid signing plus tested gates A–G, rollout/rollback and operator review |

Credentials belong in ignored local configuration or managed secrets, never source or reports. Configuration checks must remain fail-closed. No production purchases, onboarding approvals, deployments or customer data changes have been performed.
