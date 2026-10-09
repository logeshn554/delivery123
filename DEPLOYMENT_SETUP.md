# AllGo staging setup and acceptance

Configuration checks and local tests do not constitute production acceptance. Deploy functions and Firestore rules together: the client offer feed uses `listDriverOffers`, while raw unassigned booking documents are private.

## Accounts and service identity

Install root and `functions` dependencies. Keep PostgreSQL connection strings, Firebase Admin credentials, email delivery credentials and provider secrets outside Git. The account API uses the Firebase Admin packages installed in `functions/node_modules`.

Configure the account server with `ACCOUNT_FIREBASE_BRIDGE_ENABLED=true`, the actual `FIREBASE_PROJECT_ID` and `FIRESTORE_DATABASE_ID`, and Application Default Credentials. Match the client project and database. The service account must have the scoped Auth and Firestore permissions required for linking accounts and revoking sessions. Configure `ACCOUNT_EMAIL_API_KEY` and a verified `ACCOUNT_EMAIL_FROM` sender for Resend.

Neon users must verify their email before linking. Existing Firebase accounts must have a matching verified email and must not be disabled. Linking preserves existing roles and wallet balances. New service profiles are customers with zero wallet balances. Existing saved addresses migrate once; account-item bookings are never converted into paid service bookings.

Web account requests must pass through a same-origin `/api` HTTPS proxy to the account server. Web credentials use HttpOnly cookies. Native builds use `VITE_ACCOUNT_API_URL` and Android Keystore/iOS Keychain storage. The API derives ownership from the verified session; client IDs cannot select another account.

Use separate `.env.staging.local` and `.env.production.local` files or corresponding secret-manager configurations. Set explicit `ACCOUNT_ALLOWED_ORIGINS`; the production server refuses the development origin defaults. Set `NODE_ENV=production` behind the HTTPS proxy. Do not put a server secret in any `VITE_` variable.

## Coverage and operational configuration

Verified administrators with both the admin claim and profile role can configure polygons and service prices in the operations dashboard. Food/grocery prices require actual delivery rates, minimum baskets and tax/handling settings. Route services require actual fare options and appropriate parcel weight limits. Configure `MAPS_API_KEY` in Firebase Secret Manager. Quotes require resolved provider locations and enabled coverage before payment.

Merchant accounts must be assigned to their real restaurant/store. Their portal edits catalog prices, availability, variants, allergens, units, stock, opening hours and temporary closure. Carrier equipment approval requires reviewed type, payload mass and dimensions; ordinary ride approval does not authorize vehicle transport. Driver earnings require the existing `operations/settlement` configuration; its commission policy still needs an administration interface and approved business terms.

## Payments, device providers and acceptance

Configure Razorpay keys and the webhook secret in Firebase Secret Manager. Register the actual signed webhook endpoint. The webhook checks authoritative payment identity and cumulative refunds. Test callbacks in both orders, partial refunds, spent wallet credit, retries and concurrent last-stock purchases. Negative wallet debt must remain visible and must never be silently written off.

Install the actual Android `google-services.json` and iOS `GoogleService-Info.plist`. Configure release fingerprints, iOS signing/entitlements, Google/Apple/phone providers and FCM/APNs. Enable App Check enforcement only after attestation works on the target browsers and signed devices. A Gmail address alone does not configure Firebase or email delivery.

Run `node scripts/check-release.mjs --environment=staging` for configuration checks. Run `npm run lint`, `npm test`, `npm run test:rules`, `npm run android:sync` and the Android build. Use Java 21. The rules runner starts its own isolated `demo-allgo` emulator; it does not touch the live database. The working-tree/history credential scan is `node scripts/check-secrets.mjs --working-tree --history`.

For USB development, keep the account API running, authorize `adb devices`, then use `scripts/install-android.ps1`. USB localhost is development only. Production requires a deployed HTTPS API and signed release artifacts.

Complete the remaining implementation in `CHECKLIST_STATUS.md`, then run all six customer/partner/merchant/admin journeys with real staging providers. Verify notifications, lifecycle interruptions, offline recovery, backups/restoration, monitoring, approved tax invoices and legal policies. Obtain approval before production deployment.
