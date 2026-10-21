# Phone signup environments

Account creation validates the Firebase phone credential before inserting the name,
email and password into PostgreSQL. A healthy `/api/health` database response alone
does not establish that phone verification is configured correctly.

## Local development

Use `demo-allgo-accounts` consistently for the JS client, account API and Auth/
Firestore emulators. Android's native registration currently names `promtwars222`.
The phone signup flow therefore uses JS Auth when emulator mode is enabled,
including on Android, so its credential belongs to the selected local project.
Cloud Android builds continue to use native phone authentication.
Emulator routing is selected by Vite's `MODE === 'development'`, because `DEV`
is false during `vite build` even when the bundle mode is development. Using
`DEV` previously caused Android development bundles to silently use Cloud Auth.
The bundled content-security policy also explicitly permits the configured local
emulator origins for connections and the Auth helper iframe. Staging/production
bundles omit these origins.

Forward ports 3004, 9098, 8082 and 5002 over USB before opening a local APK.
Firebase Console fixed test codes are not supported by the local Auth emulator.
After requesting verification in the app, retrieve the generated local code with:

```powershell
(Invoke-RestMethod 'http://127.0.0.1:9098/emulator/v1/projects/demo-allgo-accounts/verificationCodes').verificationCodes |
  Select-Object phoneNumber, code
```

The development API health response includes `identityProjectId` and `identityMode`.
These diagnostics are omitted in staging/production.

## Firebase Console fixed test number

The configured number `+911234567890` and fixed code `123456` belong to Cloud Auth
project `promtwars222`. Both client and API must use that project with Auth emulator
settings removed. A test number still produces a real Firebase identity credential.
The backend needs Firebase Admin credentials to check the user and create the
service identity token. The browser Firebase configuration/API key cannot supply
those server credentials.

If no Admin credential is configured, open Firebase Console for `promtwars222`,
Project settings > Service accounts > Firebase Admin SDK > Generate new private
key. Store the downloaded JSON outside version control, then set
`GOOGLE_APPLICATION_CREDENTIALS` to its absolute local path in the API terminal.
Do not paste or commit the JSON. Select the same project in client Firebase config
and native `google-services.json`. Cloud Firestore configuration must also be ready
for the account service identity bridge; do not silently reuse an unrelated project.

## Verification of the signup fix

- TypeScript check and 20 focused authentication/configuration/CSP checks passed.
- A temporary local API on port 3015 rejected a mismatched phone project with 409.
- A matching verified phone completed signup (201) and service identity (200).
- All three corrected development APKs built successfully and were installed on
  the connected Android phone. The Customer app completed phone verification,
  the name/email/password form, signup (201), and service identity (200).
- The temporary phone-UI test account was signed out and removed afterward.
- Temporary regression-test identity, SQL account and service-session data were removed.
- No Firestore rules tests were run.

## Partner application incorrectly reports an expired session

The account API and development clients use `(default)`, but Functions previously
fell back to an old named Firestore database. Its callable session guard therefore
could not find a valid `bridge_sessions` record. Functions now defaults to
`(default)` for development; explicit named databases remain supported, and
staging/production still require `FIRESTORE_DATABASE_ID`.

The local Functions emulator reloaded this fix. A temporary account successfully
submitted a partner application (200). Deleting its bridge session caused the
same callable to reject a subsequent submission (401), confirming that session
revocation remains enforced. Temporary test accounts/applications were removed.
No APK rebuild or rules-test run was needed for this backend configuration fix.
