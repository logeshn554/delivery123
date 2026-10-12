# Customer UI sequence checklist

Requested review order: Food → Grocery → Ride → Delivery. Work is implemented on separate branches and should be shown and reviewed one service at a time. The attached screenshots are visual references; they are not a source of catalog items, prices, vendors, ride choices, or delivery rates.

## Food

- [x] Build a shared visual foundation for service colors, surfaces, borders, focus and 44px controls.
- [x] Add reusable loading, empty, no-results and error catalog states.
- [x] Rework restaurant discovery and menu presentation around real partner/catalog records.
- [x] Keep add-to-cart, menu options, favorites, current prices and checkout handlers intact.
- [x] Truncate long delivery addresses in the app header while retaining the full accessible label and title.
- [x] Lint, application test suite, Firestore rules suite, development-mode Vite build, Capacitor Android sync build, and Android debug compile passed (evidence recorded below).
- [ ] Validate narrow/mobile and desktop layouts, keyboard access, image failures and live catalog behavior; local browser preview could not connect under the current browser network policy, so visual acceptance is pending.
- [x] Commit and push the feature branch for review.
- [ ] Open a draft pull request: GitHub integration returned HTTP 403 `Resource not accessible by integration`; `gh` CLI is not installed. Branch is pushed; create-PR URL: https://github.com/logeshn554/delivery123/compare/main...codex/food-ui?expand=1

## Grocery

- [x] Reproduce the reference's green, clean store/catalog hierarchy without inserting its example products, discounts or prices.
- [x] Add loading, approved-store-empty, published-catalog-empty, filter-empty, connection-error, closed-store and in-stock/out-of-stock states.
- [x] Keep products, store details, prices, stock counts and image URLs sourced from approved store/catalog records; preserve the existing add/remove, favorite, details and checkout paths.
- [x] Add responsive product cards, 44px controls, image fallbacks, long store-address truncation and a live-stock cart conflict warning.
- [ ] Filter stores by the customer's delivery coverage. Current listener returns all approved stores; store-level coverage is not exposed to this screen, so the empty state accurately says no stores are listed rather than claiming no store serves the address.
- [ ] Validate 320px/mobile and desktop rendering, large text, keyboard, screen reader, low-bandwidth image failures and live catalog behavior; in-app browser local preview remains unavailable under its network policy.
- [x] Commit and push a separate grocery branch.
- [ ] Open a draft grocery pull request; GitHub integration authorization is blocked (see evidence below).

## Ride

- [x] Apply the shared design foundation to ride route entry, existing vehicle choices and fare review.
- [x] Preserve the existing address picker, Bike/Auto/Car options, server quote and payment flow; validate server fare, route estimates and quote expiration before display.
- [x] Add regressions for invalid quotes and exact expiry boundaries; location permission/search and quote failure states continue through the existing picker and server error recovery.
- [x] Show recent completed rides from the user's booking records and adapt tracking details/status to the actual ride booking, assigned vehicle type and fresh reported driver location.
- [ ] Extend the reference's vehicle/map presentation only when verified provider data is available; no unprovided driver, ETA, route image or fare has been added.
- [ ] Validate mobile/desktop layouts, large text, keyboard, screen reader, location permission and live quote recovery; local browser preview remains unavailable.
- [x] Commit and push a separate Ride feature branch. Draft pull-request creation was attempted but the connected GitHub integration returned HTTP 403 (`Resource not accessible by integration`); compare link is recorded in implementation evidence below.

### Ride implementation evidence

- Branch: `codex/ride-ui`, stacked on `codex/grocery-ui`.
- Changed UI: `src/components/ServiceBookingScreen.tsx`, `src/components/OrderTrackingScreen.tsx`, `src/components/LocationPicker.tsx`, `src/components/CustomerApp.tsx`, `src/index.css`.
- Regression coverage: `src/design-system/serviceQuote.ts` and `tests/ui/serviceQuote.test.ts` cover malformed quote data and quote expiry boundaries.
- `npm run lint`: passed.
- `npm test`: passed (58 Functions tests, 5 customer UI tests, 12 server tests, secret scan of 310 snapshots).
- `npm run test:rules`: passed (89 tests, 0 failures).
- `npm run build`: passed; Vite reports the existing `accounts` chunk at 602.87 kB.
- `npm run android:sync`: Vite build and Capacitor Android asset sync passed; the wrapper then exited because `ios/App/App/capacitor.config.json` is missing. Native Firebase config is also absent locally.
- Android `:app:assembleDebug`: passed with JDK 21; this is an unsigned debug build, not device acceptance.
- `git diff --check`: passed.
- Visual review, accessibility/device acceptance, provider-configured map experience, and live location/quote recovery remain pending. Local browser preview was unavailable under this session's local-server policy.
- Pull-request compare: <https://github.com/logeshn554/delivery123/compare/codex/grocery-ui...codex/ride-ui?expand=1>. GitHub API attempt returned HTTP 403, so no pull request has been created.

## Delivery

- [x] Restyle parcel creation around the supplied delivery reference: actual current shipments, four-step booking, route, package, people and quote review.
- [x] Preserve address resolution, existing package limits/dimensions, local/intercity choice, requested pickup time, private contacts, restriction consent, server quote, payment and handover paths.
- [x] Display all submitted parcel fields before payment and reject malformed or expired server quotes; regressions cover every parcel booking status used by tracking.
- [x] Show current shipment summaries and status-specific parcel tracking from real bookings, with actual fare, addresses, package data, private-contact loading/errors and existing handover codes.
- [ ] Add shipment labels/consignment IDs, custody scans and multi-leg manifests, package photos/signatures, failed delivery/reattempt/return flows and damage/loss claims. The audit calls these open logistics capabilities; no secure parcel evidence or custody service is available to back UI controls yet.
- [ ] Validate narrow/mobile and desktop rendering, large text, keyboard, assistive technology, location/network/quote recovery and a physical device. Browser preview was unavailable in this session, so visual acceptance is pending.
- [x] Lint, application tests, Firestore rules tests, development-mode build, Capacitor Android asset sync and Android debug compile passed (evidence below; wrapper limitations recorded).
- [x] Commit and push a separate Delivery branch. Draft PR creation is blocked by the GitHub integration's HTTP 403; compare link is recorded below.

### Delivery implementation evidence

- Branch: `codex/delivery-ui`, stacked on `codex/ride-ui`.
- Changed UI: `src/components/ParcelBookingScreen.tsx`, `src/components/CustomerApp.tsx`, `src/components/OrderTrackingScreen.tsx`, `src/components/ParcelOrderDetails.tsx`, and `src/index.css`.
- Regression coverage: `src/design-system/parcelTracking.ts` and `tests/ui/parcelTracking.test.ts` verify customer-facing tracking copy/stages for pending, assigned, in-transit, delivered and cancelled bookings.
- `npm run lint`: passed.
- `npm test`: passed (58 Functions tests, 6 UI tests, 12 server tests, secret scan of 312 snapshots).
- `npm run test:rules`: passed (89 tests, 0 failures). Emulator logs warn that Maps and Razorpay secrets are not configured locally; provider acceptance was not tested.
- `npm run build`: passed in development mode; existing `accounts` chunk warning (602.87 kB).
- `npm run android:sync`: web build and Android Capacitor sync passed with 7 plugins; the wrapper then exited because `ios/App/App/capacitor.config.json` is missing. Android Firebase native config is also absent.
- `node scripts/check-android.mjs`: passed Android `:app:assembleDebug` (`BUILD SUCCESSFUL`, 306 actionable tasks) with JDK 21; this is an unsigned debug build, not device acceptance.
- `git diff --check`: passed.
- Visual review/device/accessibility acceptance and live provider quote, map, notification, and proof workflows remain pending. No sample shipments, prices, rates, partner data or delivery promises were added.
- Pull-request compare: <https://github.com/logeshn554/delivery123/compare/codex/ride-ui...codex/delivery-ui?expand=1>. Draft PR creation returned HTTP 403 (`Resource not accessible by integration`), so no pull request has been created.

## Release evidence

- [x] Update the repository remediation register with branch/commit, changed files, command outputs and PR blockers.
- [ ] Keep provider, staging, native signing and physical-device acceptance explicitly pending until performed.

### Food implementation evidence

- Branch: `codex/food-ui`, based on `origin/main` at `76a7886a2adabe9e61740da221d6f1d4198dc6ce`.
- Files: `src/design-system/tokens.css`, `src/design-system/CatalogState.tsx`, `src/design-system/CatalogImage.tsx`, `src/index.css`, `src/components/CustomerApp.tsx`, and this checklist.
- `npm run lint` — passed.
- `npm test` — passed (Functions and server suites, secret scan).
- `npm run test:rules` — passed (89 rules tests).
- `npm run build` — passed; Vite reported an existing large `accounts` chunk warning.
- `npm run android:sync` — web build and Capacitor Android sync passed; the wrapper's final native preparation step exited because the repository lacks `ios/App/App/capacitor.config.json` (and Android Firebase config is absent, so native Firebase plugins are omitted by the preparation step).
- `:app:assembleDebug` — passed with JDK 21 (`BUILD SUCCESSFUL`, 207 actionable tasks); this is a debug build, not signed release or physical-device acceptance.
- `git diff --check` — passed.
- Visual evidence: not captured. The local dev server was available on localhost, but the in-app browser timed out and browser policy prevented a permitted alternate route. Mobile/desktop rendering and accessibility review remain pending.
- Commit: `18ed975` (`feat(food): improve customer discovery UI`). Branch push succeeded. Draft PR creation is blocked by GitHub integration authorization (HTTP 403); the GitHub CLI is unavailable. PR URL: https://github.com/logeshn554/delivery123/compare/main...codex/food-ui?expand=1

### Grocery implementation evidence

- Branch: `codex/grocery-ui`, stacked on the pushed Food branch so the reusable tokens/catalog primitives remain available.
- Files: `src/components/CustomerApp.tsx`, `src/design-system/groceryCatalog.ts`, `src/index.css`, `tests/ui/groceryCatalog.test.ts`, `package.json`, this checklist, and `docs/audit/remediation-register.md`.
- Grocery UI source: approved stores and their published product catalogs only. No sample products, prices, discounts, delivery estimates or store coverage were added.
- Coverage limitation: `listenToGroceryStores` currently returns all approved stores and does not accept a delivery address; the UI therefore does not claim its store-empty state means no partner covers the current address.
- `npm run lint` — passed (exit 0).
- `npm test` — passed (exit 0): 58 Functions tests, 3 grocery filter/state regression tests, 12 server tests, and secret scan (308 snapshots, no recognized secrets).
- `npm run test:rules` — passed (89 Firestore rules/payment emulator tests); no server/rules files changed in Grocery.
- `npm run build` — passed; Vite reported the existing large `accounts` chunk warning. This script builds the development mode bundle.
- `npm run android:sync` — Android web asset copy and Capacitor sync passed with 7 plugins; wrapper exited 1 in `scripts/prepare-native.mjs` because `ios/App/App/capacitor.config.json` is absent. Android Firebase config is absent, so the native Firebase provider acceptance warning remains.
- Android `:app:assembleDebug` with Temurin JDK 21 — passed (`BUILD SUCCESSFUL`, 207 actionable tasks). This is not a signed build or device acceptance.
- `git diff --check` — passed.
- Visual evidence: not captured. The in-app browser could not connect to the local preview under its current network policy. Screenshot review, 320px/desktop viewports, large text, keyboard and assistive technology remain pending.
- Commit: `5573813` (`feat(grocery): improve store and stock states`). Branch push succeeded. GitHub integration returned HTTP 403 `Resource not accessible by integration` for draft PR creation; `gh` CLI is unavailable. Create the stacked PR with base `codex/food-ui` and head `codex/grocery-ui`: https://github.com/logeshn554/delivery123/compare/codex/food-ui...codex/grocery-ui?expand=1
