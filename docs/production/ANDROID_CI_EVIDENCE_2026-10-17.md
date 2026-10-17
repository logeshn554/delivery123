# Android build and startup evidence — 2026-10-17

The later [run 39000324482](https://github.com/logeshn554/delivery123/actions/runs/39000324482), source `0850bd99ff59a7d6800491104c57e339dd019951`, passed application checks, the six-case real PostgreSQL/Auth/Firestore job, and all three Android build/identity/artifact jobs. Current debug artifacts (observed unexpired, expiring 2026-10-24): customer 12088523972, merchant 12088548893, delivery 12088966479. These include the linked-session authorization repair and earlier Firebase CSP fix. This is the latest hosted build evidence recorded here; runtime captures below remain the earlier public-screen observations and do not establish authenticated acceptance for the later build.

Hosted [run 38998276443](https://github.com/logeshn554/delivery123/actions/runs/38998276443), source commit `1223ebe0f41f21cb55044e54654c2e9492574360`, completed the application checks and all three Android matrix jobs successfully. Each Android job built its debug APK, scanned the web bundle for demo fixtures, verified the packaged manifest and embedded audience metadata, and uploaded the APK plus its SHA-256/size verification JSON.

| Audience | Job | Artifact ID | App ID |
|---|---|---|---|
| Customer | 117295915698 | 12088201570 | in.allgo.app |
| Merchant | 117295915666 | 12088058086 | in.allgo.merchant |
| Delivery | 117295915682 | 12088580247 | in.allgo.delivery |

Artifacts are audience-named on the run page and expire 2026-10-24. GitHub archive digests and the APK digest in verification.json describe different files and must not be compared as the same checksum. These are debug artifacts; no signing, provider or store release acceptance is implied.

The Pixel_8 AVD was restarted without loading/saving snapshots. Android reported boot complete and a healthy package service. All three local APKs installed successfully and launched their explicit MainActivity with Status: ok. Merchant and delivery recovery controls and public welcome screens were visually inspected at 1080×2400; names, text and buttons were visible. The delivery runtime registered DriverLocation; no location permission or sharing was enabled. The initial merchant capture was a black transitional frame; later settled frames and accessibility controls were inspected rather than treating the early frame as acceptance.

Local REA captures (ignored, not shipped as reference assets):

| Capture | Path under .cache/android-qa | SHA-256 |
|---|---|---|
| Merchant recovery | merchant-recovery-2026-10-17/screen.png | 1067696e2975b0fd72580097456f260858667fd7f1ae7524a13f1e057a5d6c99 |
| Merchant welcome | merchant-welcome-2026-10-17/screen.png | c7df261fc8067dacae3ca4dd3fb939a349f7ff9a9926c21828d3a7b716107e61 |
| Delivery recovery | driver-recovery-2026-10-17/screen.png | ffa25b1ca21e6e92cd7bf440d7813ab0718491584a63eff8ee2e65477cd96d02 |
| Delivery welcome | driver-welcome-2026-10-17/screen.png | 652f8cdf598733e487c06302c155e74db6beccbf5b33eecdbe079cfb5f81a8f3 |
| Customer recovery | customer-recovery-2026-10-17/screen.png | bfaced50e69eb3ac2798932022bd6df4b6d10adebecc9a81fcebb77ee8742656 |

All recovery screens report the configured account endpoint unreachable. No account server was started against the unknown configured database, no credentials or OTP requests were submitted, and authenticated/financial/notification-tap journeys remain unaccepted. Native Firebase registrations and iOS/macOS execution remain blockers.

Runtime inspection also reproduced a Firebase bootstrap CSP violation for https://apis.google.com/js/api.js. The following source fix adds that exact script origin while retaining production inline/eval restrictions. Its rebuilt customer APK passed packaged checks and launched successfully; process 11864 showed zero CSP violation matches after initialization. Capture customer-csp-fixed-2026-10-17/screen.png has SHA-256 1316f0873f1adac12191d11c3ed88ea9bf8f7eda02cb9980fa894c306ffe29ed. This postfix observation does not establish successful Google authentication and is separate from the earlier hosted run above.

Saved-address source 4070e06754831f1d19410104d1bebb9834a5d332 also passed all five jobs in hosted run 39001327488: checks 117304685300, accounts 117305078570, Android merchant 117305078566, customer 117305078576 and driver 117305078602. Debug artifacts were observed unexpired: customer 12089067456, merchant 12088997590, driver 12089241905 (expire 2026-10-24). These builds verify packaging and binary identity; no additional authenticated device or release-signing acceptance is claimed.
