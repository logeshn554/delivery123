# AllGo customer UI improvement and QA — 14 October 2026

## Scope and status

Changes were implemented in the original checkout. This pass improves customer discovery, Home, account composition, shared mobile foundations, navigation, forms and recovery messages. Business workflows, API integrations and payment authorization remain intact. No real order, payment, support message, address save or profile save was submitted.

This is an implemented UI improvement, not certification that every feature is production ready. Device QA began on the connected V2225, but the phone disconnected before the redesigned APK could be installed and inspected. Successful fulfillment and payment journeys require the service identity connection and explicit transaction authorization. Merchant, driver and administrator journeys require their respective accounts.

## Existing structure

- React/TypeScript and Tailwind/CSS, packaged with Capacitor for Android and iOS.
- App selects customer, merchant, driver or administrator interfaces from the authenticated role.
- CustomerApp coordinates Home, Services, Orders, Offers, Profile and contextual workflows.
- Food and grocery catalogs lead to cart and checkout review. Parcel, ride, driver hire and vehicle transport have separate booking forms.
- Shared design foundations are tokens.css, mobile.css and stitch.css. Reusable components include navigation, catalog states, service tiles, profile, address selection and product cards.
- Neon account authentication connects to Firebase service identity for protected booking operations. Account sign-in alone does not guarantee access to those operations.

## Prioritized decisions and implementation

| Priority | Finding | Decision and implemented change |
| --- | --- | --- |
| 1 | Shared styles referenced undefined spacing, typography, safe-area, error and elevation tokens. Invalid declarations caused inconsistent layout. | Defined the missing semantic tokens and safe-area fallbacks in the existing token file. |
| 1 | Address selection header and final form action overlapped Android system bars during device QA. | Restored the safe-area token definitions used by the dialog and bottom padding. Browser layout is checked; actual Android inset behavior still needs device confirmation. |
| 1 | Catalog messages claimed geographic filtering that the discovery query does not provide. | Changed restaurant headings, loading and empty copy to describe published partner listings and checkout availability accurately. |
| 2 | Service discovery gave active and future services similar visual priority. | Grouped six active services into Food & essentials and Delivery & travel; moved planned services into an accessible disclosure. Every active command retains its existing callback. |
| 2 | Profile presented many actions without a useful primary hierarchy. | Added Account & addresses, Orders & payments, and Help & preferences groups for primary actions. Refined the identity card and retained additional account destinations. |
| 2 | Home hierarchy and spacing needed clearer emphasis. | Personalized greeting, prioritized active booking, refined food/grocery cards, larger service targets and more consistent section rhythm. |
| 2 | Navigation and interaction states lacked consistent visual emphasis. | Added a selected icon surface, consistent navigation spacing, hover feedback, and readable disabled cursors. Existing focus-visible and reduced-motion foundations continue to apply. |
| 2 | Forms used inconsistent font sizes and account errors exposed operator configuration terminology. | Standardized form input sizing to 16px and provided account verification/sign-in/support recovery copy. The service connection itself remains a deployment blocker. |
| 3 | Desktop used the narrow mobile composition everywhere. | Added a bounded 760px customer container, wider Home service layout and a centered address dialog for larger screens. |

No new dependency was added. The existing development review gallery was extended to display the same service directory component for visual checks. Its fixtures remain limited to development review and are excluded from normal packaged app builds.

## Validation performed after implementation

| Check | Result |
| --- | --- |
| npm run lint (TypeScript) | Passed |
| npm test | Passed: 64 function tests, 10 server tests, 27 UI tests; 101 total |
| Secret scan included in npm test | Passed |
| npm run android:sync (web build and native asset synchronization) | Passed |
| Gradle :app:assembleDebug | Passed; final incremental assembly completed successfully in 13 seconds |
| Browser service directory, 320px and 360px | Inspected; no document horizontal overflow; all six active controls visible; planned controls disabled |
| Browser grocery cards, 320px | Inspected; no document horizontal overflow; add updates quantity; out-of-stock control disabled |
| Browser address form, 360px | Inspected; typed street, changed Home to Work, dismissed modal; no horizontal overflow and no real save |
| Browser profile, 360px and 1280px | Inspected; readable account composition and no document horizontal overflow. Review fixture uses default group; production supplies the three primary groups. |
| Browser offers, 768px | Inspected; no horizontal overflow; empty-cart apply control disabled |
| Browser ride choice | Auto selection updated the pressed state |
| Browser console at inspected profile state | No captured error entries |
| Android logs before redesign | No Java crash observed during tested session; exit history showed update/user-requested exits |
| Install redesigned APK / Android safe-area confirmation | Blocked: adb devices returned no connected device |
| Full live success checkout/booking/tracking | Blocked by service identity access and transaction boundary |
| Firestore rules emulator, iOS, screen reader, exhaustive contrast audit and performance profiling | Not performed in this pass |

## Reproducible issues from real-device QA

### P1 — Account can sign in but protected booking services are unavailable

1. Open the app using the supplied test account.
2. Open cart and apply an offer, or open checkout review, or use Ride address lookup.
3. Observe the service-access error. In checkout the payment continuation remains disabled.

Expected: an eligible account resolves locations and obtains a server quote. Actual: protected service calls fail before those steps. Orders also reports an unavailable combined-journey session, and Refresh does not recover it.

Suggested fix: configure and validate the Neon-to-Firebase identity bridge, verify the account email, check the service-token response and matching Firebase UID, then test callable authorization. Do not bypass access checks. The UI error wording was improved; connectivity was not fixed by this redesign.

### P1 — Global catalog search cannot return results

1. Enter a query in Home search.
2. Wait for the loading message.
3. Observe “Catalog search is unavailable”; select Retry.
4. The error repeats.

Expected: results or an explicit no-results state. Actual: callable catalog search fails. Suggested fix: verify deployed searchPublishedCatalog, service identity/App Check requirements and callable connectivity. Root cause is not yet isolated to one configuration setting.

### P2 — Address dialog overlaps Android status/navigation bars

1. Select the delivery address in the header.
2. Observe the dialog title near the Android clock/status icons.
3. Choose Add another location and scroll to Save and use this address.
4. Observe the bottom action near the Android navigation buttons.

Expected: heading and actions stay outside system bars. Actual: overlap was observed in the earlier APK. Undefined safe-area tokens were repaired. Validate the final APK on the phone with keyboard shown/hidden and both gesture/three-button navigation before closing this issue.

### P2 — Geographic catalog copy misrepresents discovery

1. Open Food delivery without selecting a restaurant.
2. Read the restaurant heading and empty-state description.

Expected: copy describes the actual catalog query. Actual: the earlier UI said “near you” and “in this area” although discovery was not filtered by location. Fixed copy now describes published listings and checkout availability.

### P2 — Cart partner identity is unclear when cached catalog data is unavailable

1. Open the persisted cart while live restaurant discovery is empty.
2. Observe a generic selected-restaurant label rather than the actual partner name.
3. Open review after catalog refresh and inspect the partner label.

Expected: identifiable partner or an explicit unavailable-partner explanation. Actual: generic fallback labels are displayed. The cart was preserved without modifying quantities. Suggested fix: persist the partner display identity with the cart, show a catalog-verification state, and continue requiring server verification before payment.

## Coverage boundaries and remaining work

Live device interaction covered Home, address selection/add form without save, search failure/retry, Services, Food empty state, persisted cart, invalid coupon failure, cart refresh recovery, checkout quote failure, Orders empty/session failure, Offers, Profile, personal-details read view, safety read view, Ride lookup failure and location-denied feedback. Back navigation and keyboard dismissal were exercised in reachable flows.

The following are explicitly unverified: successful food/grocery ordering; valid coupon acceptance; restaurant/store detail interactions with live listings; parcel, driver-hire and vehicle-transport complete forms; successful location resolution; wallet/top-up/refunds; active tracking/chat/cancellation/review submission; notifications; account export/deletion/security changes; partner onboarding; merchant/driver/admin workflows. Development component checks do not substitute for these live journeys.

Complete device testing after reconnecting the phone. Complete successful service testing in a configured staging environment with appropriate role accounts and published catalogs. Final order/payment submission must wait for the user's authorization.

## Release requirements

- Missing native Firebase google-services.json / GoogleService-Info.plist remain reported by the sync step; native providers are omitted from the development bundle.
- Existing accounts bundle exceeds the 500kB build warning threshold. Profile actual startup on representative devices before release and split the bundle if needed.
- This artifact is a development debug APK. Production readiness requires release configuration checks, native provider acceptance, device visual validation and successful authorized fulfillment/payment journeys.
