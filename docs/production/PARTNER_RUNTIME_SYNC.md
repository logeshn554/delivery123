# Shared runtime alignment — 2026-10-23

The standalone `../merchant app` and `../delivery app` workspaces had 131 differing shared runtime files each, including stale account/session protections, older dispatch/notification/evidence behavior, missing helper modules, and the broken COD journal path. Updating only the customer checkout would leave partner applications on incompatible code.

`node scripts/sync-partner-workspaces.mjs --apply` synchronized those shared files from this canonical repository. `--check` subsequently found **zero differing files** in both workspaces. The script validates each target's package name and Capacitor application ID, refuses linked target/source paths, restricts writes to its source allowlist, and backs up every replaced file before writing it. It does not delete files or create a new repository.

Previous bytes plus before/after SHA-256 manifests are in `.cache/partner-workspace-sync/71c97c54-ab6d-4e08-b0a6-26cfebed1ea3/`. The two standalone folders are not Git checkouts; the canonical implementation and repeatable synchronization script are versioned here. Keep the local backup before any future cleanup of `.cache`.

The subsequent grocery stock/expiry repair updated four backend files per partner, backed up under `.cache/partner-workspace-sync/0a57e68a-ec56-4dfa-9320-a43146ac80d7/`. Final canonical suites pass 350 application tests and 162 Firebase integration tests; subsequent backend changes do not alter the client bundle identity.

## Preserved identities and deployment contracts

| Workspace | Android application ID | Fixed client audience | Booking scheme | Account API fallback port |
|---|---|---|---|---:|
| Customer / canonical | in.allgo.app | customer | allgo | 3004 |
| Merchant | in.allgo.merchant | merchant | allgo-merchant | 3005 |
| Delivery | in.allgo.delivery | driver | allgo-delivery | 3006 |

Scope: `src` runtime modules, production `functions/*.js` modules, production `server/*.mjs` / schema, Firestore rules/indexes, Storage rules and the shared CSP helper. The fixed partner audience/scheme and account-server fallback ports are generated explicitly for each app. Package manifests, lockfiles, environment files, provider registration JSON/plist, native projects, signing material and deployment configuration remain app-owned.

Deploy the authoritative Firebase backend once to the configured canonical project/database; do not deploy competing payment or dispatch copies per client. Each account API must use the same intended canonical identity store and Firebase mapping. No deployment is performed by synchronization.

## Verification

- Both standalone `npm run lint` checks passed.
- Both standalone `npm run build:development` builds passed sequentially, using `NODE_OPTIONS=--max-old-space-size=768` and `RAYON_NUM_THREADS=2` on this host. Initial parallel builds exhausted host memory; those failures are retained in `.cache/production-{merchant,driver}-web.log`. Final logs use `-final.log`.
- Shared-source business logic passed the canonical 349 Functions/UI/server tests and 158 Firebase/rules/integration tests. This is not a claim that separate live hosted partner deployments were exercised.
- All three canonical Android debug builds passed sequentially. After native Firebase configuration was downloaded and verified, rebuilt customer (14s), merchant (40s) and delivery (22s), 308 Gradle tasks each, including the matching Google Services processing task. `aapt2` verified the package ID; ZIP inspection verified the embedded audience/appId and the real Firebase Android app ID in compiled resources. Latest SHA-256, sizes and paths are recorded in `ANDROID_ARTIFACTS_2026-10-23.json`. These are development/debug builds, not signed production packages.
- Restored the canonical workspace's default customer web bundle and native asset sync after producing the three independent role APKs, so opening the root Android project does not leave it on the last driver build.

New device-startup acceptance remains blocked: the user AVD reports an existing-instance lock, a second AVD cannot allocate its 12GB userdata partition on C: (about 5.4GB free), and the existing workspace-local AVD fails Windows RAM/commit checks (about 1.5GB commit remaining, 4GB required). No user AVD lock or data was deleted, no other applications were closed, and Swiggy was not opened. These attempted startup checks are not passes.

Native API/plugin behavior, role onboarding against real providers, authenticated fulfillment on physical devices, signed production artifacts and iOS remain separate acceptance work. Development bundles and debug APKs are not production releases.
