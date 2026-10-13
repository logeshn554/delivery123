# Implementation and verification

Branch: `redesign/allgo-unified-mobile`. Changes are local and uncommitted for review. Proposed commit grouping: `feat(ui): unify mobile foundations and partner navigation`; `feat(native): brand AllGo launch screens`; `docs(audit): inventory references and record acceptance evidence`. No push, pull request, merge or deploy was performed.

## File-by-file changes

| File | Change and purpose |
|---|---|
| src/design-system/tokens.css | Added semantic feedback, type, spacing, radius, elevation and safe-area tokens; improved navigation active surface and additive native inset padding |
| src/design-system/mobile.css | Shared responsive foundations for readable controls, customer/partner/operations text, forms, cards, focus, offline spacing and reduced motion |
| src/design-system/PageHeading.tsx | Shared wrapping title, description, named back action and programmatically focusable heading |
| src/design-system/StatusPanel.tsx | Shared loading/empty/error announcements and visual states |
| src/main.tsx | Loads the shared mobile foundations after existing stylesheet rules |
| src/index.css | Reuses central brand/muted tokens, removes sub-12px CSS captions and removes the forced 320px minimum that caused horizontal overflow with scrollbars |
| src/components/AuthScreen.tsx | Screen/step transitions restore scroll and heading focus; existing native back event handles auth flow; existing credentials/provider logic retained |
| src/components/CustomerApp.tsx | Clear home heading, named global search, shared catalog loading state, safe-area-aware compact header; removes duplicated unavailable combined journey callout from Home while preserving Services availability message |
| src/components/DriverApp.tsx | Shared Deliveries/History/Earnings/Support navigation; full subview region above navigation; inactive dashboard is inert; misleading static secure-GPS footer removed |
| src/components/MerchantPortal.tsx | Light shared palette and Orders/Catalog/Settings navigation; grouping preserves existing preparation/picking/stock/hours/closure handlers and mounted form state; scroll/focus reset; real merchant type badge |
| src/components/AdminDashboard.tsx | Scoped common readable caption/input/touch sizing; retains desktop operations architecture |
| src/components/ConnectionStatus.tsx | Safe-area-aware offline message; measured wrapping height reserves space instead of covering app controls |
| src/components/useFeedbackDialog.tsx | Bounded viewport-aware scrolling dialog surface using shared styling |
| android/app/src/main/res/drawable/allgo_mark.xml | Original code-native white A vector; no third-party artwork copied |
| android/app/src/main/res/drawable/allgo_splash.xml | Legacy centered mark/purple launch drawable |
| android/app/src/main/res/values/styles.xml | Uses AllGo launch surface and modern splash attributes, then existing app theme |
| ios/App/App/Base.lproj/LaunchScreen.storyboard | Uses centered static A/purple launch surface instead of stock Splash image; Xcode/device rendering not verified |
| server/mobileFoundations.test.mjs | Rendering checks for loading vs failure announcements and a named non-submitting back action |
| scripts/audit-ui-reference.mjs | Reproducible read-only exhaustive file inventory, duplicate detection, TypeScript/TSX syntax inspection and component comparison |
| docs/audit/2026-10-13/* | ZIP/app inventories, comparison matrix, design specification, screen acceptance register and real screenshots |

Temporary ignored `.env.ui-review.local` selects the existing Firebase provider only for `--mode ui-review`. It does not affect normal development/staging/production modes. Public auth preview runs at localhost:3002; the configured development preview runs at localhost:3001 and requires its existing account API. The API was not started because its startup code performs database schema writes. No ZIP source was executed.

## Verification results

| Check | Result | Scope / limits |
|---|---|---|
| npm run lint | PASS | Script is TypeScript `tsc --noEmit`; there is no separate ESLint command configured |
| npm test | PASS | 64 Functions tests + 10 UI logic tests + 23 server/rendering tests = 97; zero failures |
| Secret scanner | PASS | Final application test run inspected 358 snapshots; no recognized secret or saved DB credential found; no credential values included in reports |
| npm run test:rules | PASS | 96 isolated emulator authorization/integration tests; real provider calls are mocked, not live acceptance |
| npm run build / android:sync | PASS | Development Vite build, Capacitor web asset/plugin sync and existing native preparation; retained accounts chunk >500kB warning |
| node scripts/check-android.mjs | PASS | Final synchronized assets + native launch changes; BUILD SUCCESSFUL in 32s, 37 executed/269 up-to-date tasks |
| Native XML parsing | PASS | Android vector/layer-list and iOS storyboard well-formed XML; not an iOS compile |
| Browser public auth | CHECKED | Welcome, three onboarding steps, signup, signin, reset, password visibility and screen focus/scroll; 320/390/430px representative viewports |
| Browser configured account startup | BLOCKED for authenticated flow | Actual reconnect screen observed because account API is unavailable |
| Android/iOS physical device | NOT VERIFIED | No deployment, install or device service acceptance in this session |
| iOS compile | NOT VERIFIED | Xcode/CocoaPods/device acceptance required on macOS |

The first restricted Android attempt could not access the Gradle cache; the restricted emulator attempt could not open loopback sockets. Both were retried with permitted execution and passed. The first restricted preview could not be reached; an allowed local preview was used for actual screenshots. Those failed attempts are not recorded as successful checks.

Build/sync reports that actual native Firebase configuration is missing. Existing preparation omits native Firebase providers from this development bundle; this is not a native Google/Apple/phone/push/App Check acceptance pass. Native services were not silently enabled or security checks removed.

## Remaining work, ordered by priority

1. **P0 — Staging identity and service acceptance:** provide/reach the configured account API or a deliberately configured staging Firebase environment. Verify customer/driver/merchant identities and role ownership before checking navigation, catalog, quotations, provider checkout, wallet, payment recovery and fulfillment. The current configured default app cannot proceed beyond reconnect without that API.
2. **P1 — Authenticated visual QA:** capture and accept every A screen in the journey register at 320/390/430px, enlarged fonts and keyboard-open states. Merchant grouping and the driver subview/navigation need real-role interaction evidence. Review exact order/stock/booking states rather than treating source/style changes as completion.
3. **P1 — Provider/native configuration:** supply actual platform Firebase files, sync and rebuild. Verify location permission denial/revocation, stale GPS, background driver sharing, native back, notifications and payment-provider return/cancellation on Android/iOS.
4. **P2 — iOS/device verification:** build the storyboard and app with Xcode/CocoaPods; inspect native splash and safe areas on representative devices; check offline transitions, focus/dialog behavior and keyboard avoidance.
5. **P2 — Missing workflows:** no supported goods/movers booking; no customer grocery delivery-slot/substitution choice; no standalone photo/signature delivery-proof UI; no verified global dark-mode switch. Parcel/transport custody confirmation and merchant picking already exist; they are not a replacement for an unimplemented feature. Implement missing workflows only with actual backend contracts.
6. **P2 — Existing product gaps:** customer catalog discovery is not geographically filtered in the UI; server quotation/coverage remains the authority. Combined journey building remains unavailable; existing owner history/status is retained. Persistent guarded routes and further CustomerApp decomposition remain architectural work.
7. **P3 — Further consistency/performance:** finish eliminating service-local hard-coded tokens after authenticated visual review; evaluate account/Firebase chunk splitting and deeper merchant analytics if backed by actual data; test reduced motion and screen readers on devices.

The final success criteria are **not all met**: every file and source screen is accounted for, implemented changes compile and automated checks pass, but no authenticated end-to-end live service or native-device journey has been verified. Release readiness remains pending rather than inferred from screenshots or compilation.
