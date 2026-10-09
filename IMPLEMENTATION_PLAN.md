# AllGo implementation plan

Work proceeds in order. Each phase has source implementation, error/empty/loading states, and a separate live acceptance check. A local change does not mean a provider is configured or a release is ready. Do not populate fictional operational data.

| Phase | Work | Completion criteria | Status |
| --- | --- | --- | --- |
| 1 | Startup, account registration, sign-in, session restoration and profile access | Useful errors; safe profile creation; real name; reload retains account; live registration/reset/sign-in verified | Source complete; live acceptance pending |
| 2 | All reference mobile screens, navigation, accessibility and Android back behavior | Every visible action has a destination; safe areas, keyboard, loading/empty/error states; phone review of all screens | Source complete; phone acceptance pending |
| 3 | Food and groceries | Real categories/search/menus/products, item options, stock, cart persistence, addresses, order summary; catalog totals validated on server | Source complete; live acceptance pending |
| 4 | Parcel, ride, personal driver and vehicle transport | Address selection and coordinates, service zones, dates, parcel constraints, configurable fare rules and expiring quotes | Source implemented; provider acceptance pending |
| 5 | Payments, cancellations and refunds | Native checkout, idempotent fulfillment, payment recovery, refund reconciliation, inventory concurrency; provider test transactions verified | Source implemented; provider/concurrency acceptance pending |
| 6 | Partner operations and dispatch | Merchant preparation, verified driver assignment, rejection/reassignment, delivery code, cancellation and server-managed earnings | Source implemented; partner/migration acceptance pending |
| 7 | Tracking, maps and communication | Real location permissions, location freshness, routing/ETA provider, order history, authorized chat and lifecycle transitions | Source implemented; location/provider acceptance pending |
| 8 | Wallet, offers and account management | Ledger-backed top-ups/spending, coupons with eligibility, settings, support, account deletion and privacy controls | Source implemented; wallet/privacy acceptance pending |
| 9 | Native authentication and notifications | Android/iOS Google, Apple where supported, phone OTP, push tokens, event notifications and deep links | Source implemented; native/provider acceptance pending |
| 10 | Production hardening | Rules/roles audit, rate limiting, monitoring, recovery, data retention, deployment environments and release validation | Source implemented; cloud hardening acceptance pending |
| 11 | Android/iOS delivery | Signed Android build on device; iOS build/signing on macOS; store assets, review requirements, deployment and smoke checks | Build preparation implemented; signing/device acceptance pending |

## Design scope

Follow the attached AllGo mobile reference: welcome/onboarding, home, food, grocery, parcel, ride, personal driver, vehicle transport, order tracking, profile/wallet and partner app. Add the necessary item detail, cart, checkout, addresses, booking review, order history, settings and support screens. The desktop dashboard in the reference is an operations tool; the customer product remains Android/iOS.

## External dependencies

- Firebase project access, enabled authentication providers, database deployment and Cloud Functions billing.
- Operator-owned catalog, service coverage, actual rates, cancellation policy and driver settlement policy.
- Razorpay merchant credentials/webhook setup and test payment instruments.
- Maps/routing provider credentials and agreed service limits.
- Platform Firebase registrations, signing fingerprints, Apple developer credentials and push configuration.
- macOS/Xcode for iOS signing and release; Android SDK/JDK for Android.

Continue independent source work when a dependency is unavailable. Record the exact outstanding setup and do not substitute a simulated success.

## Phase 1 progress

- Existing: startup boundary, visible Firebase errors, email registration/sign-in/reset, profile retry, live account subscription.
- This pass: registration name, atomic profile creation, stable booking subscription dependencies, removal of unsolicited database probe, Firebase configuration sanity checks.
- Source complete. Pending live account creation, reset delivery, logout/reload and provider configuration review. Native social/OTP authentication is scheduled for phase 9.

## Phase 2 progress

- Existing customer flows cover onboarding, home, food, groceries, parcel, ride, personal driver, vehicle transport, orders/tracking, profile, wallet, settings, support and saved addresses.
- This pass: route Android hardware Back through the current mobile screen hierarchy and support Escape for desktop/browser review; make address selection keyboard accessible.
- Source review complete. Phone acceptance remains pending. The configured ADB server was reachable, but no Android devices were attached during this pass.

## Phase 3 progress

- Source complete: live catalog subscriptions include loading, error and empty states; menu variants are selected and retained in the cart; the backend resolves variant labels and prices from Firestore and rejects missing or unavailable variants. Grocery quantities are checked and decremented in the payment fulfillment transaction.
- Live acceptance pending: populate actual merchant catalogs using the schema in `MOBILE_SCREEN_SETUP.md`, then verify order totals, inventory changes and payment fulfillment with provider test credentials.

## Phase 4 progress

- Source implemented: provider address selection, server resolution to coordinates, configured polygon coverage, route distance/duration, base/distance/time/weight rates, distance and parcel weight limits, vehicle identity, schedule validation, and stored five-minute quotes consumed by checkout.
- Checks: TypeScript and production web build passed; three booking policy tests passed. Actual Google API calls, operator polygons/rates and phone booking acceptance remain pending. Exact setup is in `MAPS_SETUP.md`.

## Verification record

- TypeScript check, production Vite build and backend syntax check passed after the Phase 3/4 changes.
- No device was connected for native acceptance. No Firebase deployment, real provider payment or signed release has been performed.

## Phase 5 progress

- Source: captured-payment fulfillment, private payment activity and authenticated provider recovery; stable refund idempotency; accurate pending/processed/failed handling; duplicate/out-of-order refund protection; one-time grocery stock restoration after cancellation; checkout success opens the confirmed order and preserves unrelated carts.
- Pending acceptance: provider test checkout, lost callbacks, webhook replay, simultaneous inventory purchases and refund failures against the deployed backend. Payment activity requires the new callable functions and index.

## Phase 6 progress

- Source: bound merchant catalogs/orders, transactional preparation and stock updates, ready-only catalog dispatch, approved driver capabilities and ride vehicle matching, rejection/reassignment, protected recipient codes with failed-attempt limits, completion earnings ledger, reserved withdrawal requests and operations recording of actual transfer receipts.
- Pending acceptance: real merchant assignments, partner document review, settlement policy, code migration over legacy records, concurrent dispatch and completed transfers. Exact requirements are in `PARTNER_SETUP.md`. No external transfer has been performed.

## Working rules

Finish and document one phase before advancing. Review changes against its completion criteria. Run verification when requested. Ask for deployment approval only after the deployable changes and required configuration are concrete.

## Phase 7 progress

- Source: explicit device location/address selection, server-authorized and throttled partner positions, private booking tracking, one-minute freshness checks, provider travel estimates, participant-only chat with server timestamps and closed-journey enforcement. Driver identity documents are readable only by their owner and operations.
- Pending acceptance: real permission prompts on both platforms, background/location interruption behavior, deployed routing credentials and two-account chat. Tracking currently runs while the partner app is active; background delivery requires platform-specific location entitlement work.

## Phase 8 progress

- Source: captured-payment wallet funding, transactional spending/refunds, private ledger UI, cart offer eligibility and atomic redemption, recent-sign-in deletion requests, operations processing and personal-data erasure with preserved financial references. Configuration is in `ACCOUNT_SETUP.md`.
- Pending: live wallet/offer/deletion acceptance, operator privacy publication and retention configuration, automated exports (currently support-managed).

## Phase 9 progress

- Source: native Google/Apple credentials, phone OTP and verified native token exchange into the shared Firebase session, private device registration/expiry, real booking event push, invalid-token cleanup, logout cleanup and authorized booking deep-link navigation.
- Pending: Firebase native configuration, APNs and platform entitlements, sign-in fingerprints/provider activation, OTP throttling/provider quotas, token refresh/reinstall and foreground/background delivery on real Android/iOS devices. Capacitor 7 Firebase plugins declare an optional Firebase 11 web peer; this project retains Firebase 12 and invokes those plugins only on native platforms.

## Phase 10 progress

- Source: custom-claim operations authorization, direct financial/lifecycle write restrictions, per-endpoint rate limits, account deletion access lock, bounded callable capacity, secret-file ignores, environment database selection, role provisioning dry-run utility and production recovery/monitoring/retention runbook.
- npm reported a gRPC advisory; the client dependency override installed successfully with zero reported vulnerabilities. The server UUID advisory was resolved with a patched CommonJS override after checking its consumers use the compatible v4 API; npm also reports zero vulnerabilities for server dependencies.
- Pending: App Check native provider registration and live attestation acceptance, deployed rules/index audit, actual cloud alerts/TTL, staging concurrent acceptance and reviewed production configuration. See `PRODUCTION_SETUP.md`.

## Phase 11 progress

- Android debug APK, unsigned release APK and unsigned AAB rebuilt successfully from the Firebase-filtered synchronized bundle with JDK 21/SDK 35. `npm run lint`, production Vite build and Cloud Functions syntax checks pass. Added external signing/version environment support and a signing-required build switch. New monogram icons are in `release-assets` for operator review. The web bundle is copied to the iOS source project; native Firebase plugin registration is omitted there until the real plist is supplied.
- Pending: connected-device acceptance, actual signing identity, native Firebase registration, iOS macOS/Xcode archive, approved store screenshots/listing/privacy policy and cloud deployment. Exact handoff is in `RELEASE_HANDOFF.md`.
