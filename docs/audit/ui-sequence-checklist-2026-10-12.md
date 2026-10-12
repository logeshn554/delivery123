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
- [ ] Commit, push and open a separate grocery pull request; PR integration authorization is currently blocked (see evidence below).

## Ride

- [ ] Align booking and quote screens with the shared design foundation and supplied ride reference.
- [ ] Preserve configured vehicle choices, pricing, coverage checks and server quote authority.
- [ ] Validate location, permission, loading, quote failure and booking recovery states.

## Delivery

- [ ] Align parcel creation and tracking with shared components and supplied delivery reference.
- [ ] Preserve configured rates, package constraints, handover and tracking authority.
- [ ] Validate empty, upload, network, status, keyboard and responsive states.

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
- `git diff --check` — pending final review.
- Visual evidence: not captured. The in-app browser could not connect to the local preview under its current network policy. Screenshot review, 320px/desktop viewports, large text, keyboard and assistive technology remain pending.
- Grocery PR — not created yet. GitHub integration returned HTTP 403 on Food PR creation and `gh` CLI is unavailable. After branch push, use https://github.com/logeshn554/delivery123/compare/codex/food-ui...codex/grocery-ui?expand=1 for a stacked review.
