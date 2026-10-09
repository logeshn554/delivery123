# AllGo authentication setup

## Neon accounts (current local configuration)

`.env.local` selects `VITE_AUTH_PROVIDER=neon`. Email/password signup and login now use `server/accounts.mjs`, not Firebase Auth. Neon stores password hashes, expiring sessions, customer profiles, saved addresses, support tickets and account deletion requests. The API takes the account identity from the verified session and does not accept client-assigned roles or wallet balances. Existing Firebase accounts are separate and are not automatically migrated.

Run `npm run dev:api` in one PowerShell window and `npm run dev` in another. Vite proxies `/api` to the account server on port 3004. Database credentials are loaded only on the server from the ignored `.env.local` file; never place them in frontend source or a `VITE_` variable.

For the installed Android debug app, keep the API running on the computer, connect the phone by USB, and run:

```powershell
adb reverse tcp:3004 tcp:3004
npm run android:sync
cd android
.\gradlew.bat installDebug
adb shell am force-stop in.allgo.app
adb shell monkey -p in.allgo.app 1
```

The build reads `VITE_ACCOUNT_API_URL=http://localhost:3004` for USB development. Android permits HTTP and mixed content only for debugging; release builds need a deployed HTTPS API and an updated `VITE_ACCOUNT_API_URL`. Rebuild after changing frontend environment variables. Disconnecting USB or stopping the computer API disconnects this development account service.

`node scripts/check-accounts.mjs` verifies live account behavior using a temporary account and removes it afterward. Run only against a database you authorize for verification. Type checking and production build alone do not verify database signup or login.

Google/Apple/phone login, email password recovery, notifications, dispatch, quotes and payment processing have not been migrated to the Neon account backend. Their Firebase integrations cannot use a Neon session. Unconfigured operations report an error instead of using an unauthenticated Firebase session. Catalog and booking reads use the new `allgo_catalog` and `allgo_bookings` tables; no records are seeded and existing Firestore records are not copied. The deletion endpoint records a pending request for operator processing; it does not claim that deletion has been completed.

Rotate any database password shared in chat, then replace `DATABASE_URL` in `.env.local` and restart the API.

## Firebase mode

The instructions below apply when `VITE_AUTH_PROVIDER` is unset or set to `firebase`.

The mobile app now supports Firebase email/password registration, sign-in and password reset. Sessions are managed by Firebase Auth. New profiles are created as customers, matching the existing Firestore rules. Existing assigned roles are preserved.

## Required Firebase setup

1. In Firebase Console, select `golden-polygon-3rrhs`.
2. Open Authentication → Sign-in method and enable Email/Password.
3. Check that the named Firestore database `ai-studio-33ff364a-171b-472c-93a0-dd18e20cf1e4` exists and its deployed rules allow a signed-in customer to create their own profile. Repository rules are in `firestore.rules`; editing them locally does not deploy them.
4. Create an account from the app. Account creation, password reset delivery and database permissions must be verified against the configured Firebase project; compilation does not verify them.

The app reads `VITE_FIREBASE_*` variables when present and falls back to `firebase-applet-config.json`. Restart Vite after environment changes. Never put service-account keys or payment secrets in VITE variables.

## Google and phone sign-in

Google browser popup sign-in remains available for browser development. Enable the Google provider and authorize your browser development hostname in Firebase Authentication settings.

Native Google and iOS Apple sign-in now obtain native provider credentials and sign into the Firebase JavaScript session. Phone sign-in uses the native OTP flow then a server-verified token exchange. Enable Google, Apple and Phone providers in Firebase. Native integration requires:

- Android Firebase registration for `in.allgo.app`; put the real `google-services.json` in `android/app`; register debug and release SHA-1/SHA-256 fingerprints. Enable Play Integrity/phone provider configuration and quotas. The Google native dependency is enabled in `android/variables.gradle`.
- iOS Firebase registration; add the real `GoogleService-Info.plist` to the Xcode target. Configure the reversed client ID URL scheme, Apple Sign In capability and provider credentials. The Google pod is included; Apple/Phone are part of the base plugin.
- Firebase Messaging/APNs key, Push Notifications capability, notification permission and background remote-notification capability. The app registers devices only after an explicit Enable device notifications action. Event messages omit addresses and recipient codes.
- Custom booking links use `allgo://booking/ALLGO_<id>` and are authorized by the actual account's booking subscription. Universal Links/App Links need an operator-owned domain and association files before adding HTTPS links.
- Capacitor 7 auth/messaging plugins declare Firebase 11 as an optional web peer. This app retains Firebase 12, uses their native APIs only, and pins the shared `@firebase/app` dependency. Device acceptance is required before release.

No platform files or signing/provider credentials have been invented. Missing setup remains a live acceptance blocker.

## Live service requirements

Catalog cards read restaurant/store documents and their menu/product subcollections. Empty collections show empty states; the UI does not seed restaurant listings or advertise invented discounts.

Payments require the server functions and Razorpay configuration described in `PAYMENTS.md`. Real dispatch, map routing, native push notifications, and partner inventory require configured services and partner operations. These UI changes do not deploy those services.

## Running the updated interface

Keep `npm run dev` running, refresh the browser, and reopen the Android app connected through Capacitor live reload. Bundled APKs require `npm run android:sync` and a new Android build.
