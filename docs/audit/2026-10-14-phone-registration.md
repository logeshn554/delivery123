# Phone-first registration and login repair

## Implemented flow

The configured Neon account flow now starts new registration at the phone number, then verifies an SMS OTP, asks for Customer/Merchant/Driver, and collects name/email/password. Phone and OTP are also available for signing into accounts registered through this flow. Existing email/password sign-in remains available.

Phone verification uses the existing Firebase authentication SDK: native Firebase Authentication on Android/iOS; an isolated Firebase auth instance and visible reCAPTCHA on web. It does not sign the main app into a partially registered account. No locally generated OTP, test-code bypass or fake verification is used.

The API verifies the Firebase ID token, revocation, phone provider, current phone ownership and recent authentication. Registration stores the verified phone and provider identity. Unique indexes prevent duplicate verified phone/provider registrations. The public role choice is restricted to Customer, Driver and Merchant; administrative registration is rejected.

Customers receive customer access. Driver/Merchant choices are retained as registration intent and open the existing partner application flow, prefilled with the verified phone and name. Dispatch/business permissions activate through the existing approval process. Role selection does not bypass driver eligibility or merchant business assignment.

## Login fixes

- Reject incomplete account/session responses with a readable error.
- Normalize absent, empty or literal “undefined”/“null” display names to “Your account”.
- Use the canonical account name/email in the service identity response.
- Offer a route back to sign-in when profile loading fails without an active user.
- Accept verified-phone identity for the service bridge; email verification is still required for older email-only accounts where applicable.

The reported “undefined” login was not reproduced on a connected phone. These changes address the unsafe response/name paths found in the code; actual device acceptance remains required.

## Validation

- TypeScript passed.
- 108 tests passed: 64 functions, 13 UI, 31 server.
- New tests cover missing profile data, readable name fallbacks, preserved role intent, stale/malformed/non-phone proof and rejection of administrative registration.
- Secret scan passed.
- Web build and Android sync passed.
- Android debug assembly passed.
- Updated API started on port 3004 with the schema indexes applied.
- API health passed; identityBridgeEnabled was false, confirming the configuration blocker.
- Supplied test account's existing email login returned a valid native session and a present name (not “undefined”); the temporary test session was logged out without exposing its token.
- No real account, SMS, order or payment was created during testing.

## Required configuration and acceptance

The current Android sync still reports missing google-services.json and omits native Firebase authentication. Phone verification on that build displays an explicit configuration error. Add the real native Firebase configuration for in.allgo.app, enable/configure Firebase Phone Authentication for the same project, and configure the server identity bridge and Firebase server credentials. Re-sync and rebuild afterward. Web verification also requires the app's domain to be accepted by Firebase.

Live OTP success, wrong/expired-code behavior from the actual provider, resend delivery, customer account creation, partner application submission, approved-role login and installation on the phone remain unverified. The phone was disconnected during prior QA, and the current browser inspection was previously blocked by its access policy.

Older email-only accounts retain email login. Their phone numbers must be linked through a verified account-linking process before phone login can identify them; this change does not automatically associate a newly verified phone with an existing email account.

The legacy Firebase-only email registration flow is unchanged. The new phone-first role flow applies to the configured Neon account API path.
