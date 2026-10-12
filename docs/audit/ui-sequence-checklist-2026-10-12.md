# Customer UI sequence checklist

Requested review order: Food → Grocery → Ride → Delivery. Work is implemented on separate branches and should be shown and reviewed one service at a time. The attached screenshots are visual references; they are not a source of catalog items, prices, vendors, ride choices, or delivery rates.

## Food

- [x] Build a shared visual foundation for service colors, surfaces, borders, focus and 44px controls.
- [x] Add reusable loading, empty, no-results and error catalog states.
- [x] Rework restaurant discovery and menu presentation around real partner/catalog records.
- [x] Keep add-to-cart, menu options, favorites, current prices and checkout handlers intact.
- [x] Truncate long delivery addresses in the app header while retaining the full accessible label and title.
- [x] Lint, application test suite, Firestore rules suite, production build, Capacitor Android sync build, and Android debug compile passed (evidence recorded below).
- [ ] Validate narrow/mobile and desktop layouts, keyboard access, image failures and live catalog behavior; local browser preview could not connect under the current browser network policy, so visual acceptance is pending.
- [x] Commit and publish a draft pull request for review.

## Grocery

- [ ] Reproduce the reference hierarchy without inserting its example products or prices.
- [ ] Implement loading, service-area empty, store-empty, no-results, error, closed and stock states.
- [ ] Keep all products, variants, stock and prices sourced from active store catalogs.
- [ ] Validate mobile accessibility, long addresses and cart stock conflicts.

## Ride

- [ ] Align booking and quote screens with the shared design foundation and supplied ride reference.
- [ ] Preserve configured vehicle choices, pricing, coverage checks and server quote authority.
- [ ] Validate location, permission, loading, quote failure and booking recovery states.

## Delivery

- [ ] Align parcel creation and tracking with shared components and supplied delivery reference.
- [ ] Preserve configured rates, package constraints, handover and tracking authority.
- [ ] Validate empty, upload, network, status, keyboard and responsive states.

## Release evidence

- [x] Update the repository remediation register with branch/PR, changed files and actual command outputs.
- [ ] Keep provider, staging, native signing and physical-device acceptance explicitly pending until performed.

### Food implementation evidence

- Branch: `codex/food-ui`, based on `origin/main` at `76a7886a2adabe9e61740da221d6f1d4198dc6ce`.
- Files: `src/design-system/tokens.css`, `src/design-system/CatalogState.tsx`, `src/design-system/CatalogImage.tsx`, `src/index.css`, `src/components/CustomerApp.tsx`, `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, and this checklist.
- `npm run lint` — passed.
- `npm test` — passed (Functions and server suites, secret scan).
- `npm run test:rules` — passed (89 rules tests).
- `npm run build` — passed; Vite reported an existing large `accounts` chunk warning.
- `npm run android:sync` — web build and Capacitor Android sync passed; the wrapper's final native preparation step exited because the repository lacks `ios/App/App/capacitor.config.json` (and Android Firebase config is absent, so native Firebase plugins are omitted by the preparation step).
- `:app:assembleDebug` — passed with JDK 21 (`BUILD SUCCESSFUL`, 207 actionable tasks); this is a debug build, not signed release or physical-device acceptance.
- `git diff --check` — passed.
- Visual evidence: not captured. The local dev server was available on localhost, but the in-app browser timed out and browser policy prevented a permitted alternate route. Mobile/desktop rendering and accessibility review remain pending.
- Draft PR: pending publication in this record until a URL is confirmed.
