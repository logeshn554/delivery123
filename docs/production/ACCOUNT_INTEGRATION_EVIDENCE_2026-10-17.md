# Account lifecycle integration evidence — 2026-10-17

The `accounts` job 117301999453 in [hosted run 39000324482](https://github.com/logeshn554/delivery123/actions/runs/39000324482), source commit `0850bd99ff59a7d6800491104c57e339dd019951`, completed successfully. The test script reported **6 passed, 0 failed, 0 cancelled, 0 skipped**, followed by emulator script exit code 0. The application check job and all three Android build/verification/artifact jobs also passed. Android artifact IDs are recorded in ANDROID_CI_EVIDENCE_2026-10-17.md.

This run used a fresh PostgreSQL 17 service and the actual Express account server, Firebase Auth emulator, Firebase client/Admin SDKs, Firestore emulator and repository security rules. SQL, token verification, custom-token creation, bridge storage and rule decisions were not stubbed. The account API reported readiness on the dedicated loopback port 3014. Endpoint/project/database/user/empty-schema guards were active.

| Case | Verified behavior |
|---|---|
| Verified-phone lifecycle | Emulator phone verification registers a customer despite supplied privileged fields; SQL stores a password hash and native session; the unique SQL/Firebase UID link and hashed bridge session agree; a custom-token client reads its booking; profile escalation fails. The original phone token without the bridge claim receives HTTP 403. SQL logout invalidates its bearer and removes the bridge; the previously authenticated Firebase client can no longer read the booking. |
| Password change | Two SQL/Firebase sessions are created. Changing the password through the second revokes the first SQL session and its Firebase rule access, retains the current session, rejects the old password and accepts the new one. |
| Duplicate-phone race | Concurrent registrations of one verified phone return one 201 and one 409; exactly one account row exists for the phone. |
| Browser cookie/origin | Browser login returns no bearer token in JSON, sets HttpOnly/SameSite=Strict cookie, permits an authenticated read, rejects a cookie-authenticated write without origin and permits an allowed-origin write. |
| Limited migration | A saved label/address migrates once across repeated bridge calls. Legacy SQL booking JSON remains legacy history and creates no paid Firestore booking. Full legacy metadata migration is not established. |
| Bridge expiration | Expiring the server bridge record denies the otherwise valid Firebase client's profile read. |

All phone identities, verification codes, accounts and passwords belonged to the isolated test services. No real SMS/email, live Firebase/Neon resource, provider payment or customer account was used. The CI PostgreSQL service is disposable; no application database was connected or cleaned by this run.

The missing-claim authorization repair also passed 111 isolated Firestore/integration tests locally. Pre-fix tests had reproduced both Firestore and local-callable fallback access; the repaired rules/callables require a live session for Neon-linked identities while retaining Firebase-only development accounts.

This evidence does not close staging/production resource setup, complete legacy migrations, deletion/retention scheduling, real provider verification, approved merchant/driver role provisioning, authenticated Android/iOS journeys or release signing. Follow the isolated runner instructions in ../testing/account-lifecycle-integration.md and inspect the source commit and run when comparing later results.
