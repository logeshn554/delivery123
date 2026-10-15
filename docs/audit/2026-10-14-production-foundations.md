# AllGo production implementation log — 2026-10-14

## Scope and repository state

Existing checkout: `delivery123`, origin `https://github.com/logeshn554/delivery123.git`.
Remote HEAD matched local base `f4c7505` when checked. Work branch:
`codex/allgo-production-foundations`. Extensive pre-existing uncommitted changes
were present; they are preserved and excluded from the scoped foundation commit.
This is an initial source audit, not a completed production certification.

REA MCP tools are available (including JavaScript analysis, browser capture and
artifact inspection). No third-party application artifact was supplied or analyzed.
No claim of reverse engineering Swiggy, Instamart or another application is made.

## Source inventory and findings

| Area | Evidence | Finding / remaining verification |
| --- | --- | --- |
| Entry/auth | `src/main.tsx`, `src/App.tsx`, `src/accounts.ts`, `server/accounts.mjs` | React/Vite client, Firebase and PostgreSQL account paths; current working App renders CustomerApp. Partner/admin entry routing needs explicit verification. |
| Customer services | `src/components/CustomerApp.tsx`, `src/features/discovery/ServiceDirectory.tsx` | Food, grocery, parcel, ride, driver hire and vehicle transport entry points exist. Goods transport and movers remain planned; inter-city acceptance is unverified. |
| Merchant/driver/admin | `MerchantPortal.tsx`, `DriverApp.tsx`, `AdminDashboard.tsx` under `src/components` | Existing modules must be reused. Workspace sibling merchant/delivery folders also exist; do not duplicate them or assume they are published in this repository. |
| Shared UI | `src/design-system/{tokens,mobile,stitch}.css`, `CatalogState.tsx`, `StatusPanel.tsx`, `BottomNavigation.tsx` | Later Stitch CSS replaced root tokens. Existing local token additions already address several missing values reported by UI_PROGRESS.md. Broader consolidation remains unfinished. |
| Data/authz | `src/data/firestoreHelper.ts`, `src/data/firebaseHelper.ts`, `firestore.rules`, `storage.rules` | Shared callable service adapter, account/session checks and default-deny rules exist. Emulator/integration validation remains required. |
| Backend | `functions/index.js` and domain policy modules | Existing quote, payment, COD, dispatch, fulfillment, payout, cancellation and refund operations; unit tests do not prove deployed integration. |
| Payments/maps | `src/payments.ts`, `functions/maps.js`, payment/tracking callables | Razorpay web/native checkout and server operations exist. Real provider callbacks, refunds and route/privacy behavior have not been exercised this run. |
| Native/release | `capacitor.config.json`, `scripts/check-release.mjs` | Android/iOS Capacitor targets configured; production gate fails for missing configuration, native Firebase registrations and operator acceptance. No signed release built. |

## Implemented

- TASK-02: extended the shared type scale with display, headline, subtitle,
  callout and tiny sizes; added line-height and weight tokens; applied the tokens
  to common authentication, mobile heading and status styles. The shared
  phone/browser input size stays 16px to avoid iOS focus zoom.
- TASK-03: moved the shared indigo tint into the token layer, aligned the app
  canvas with `#f8f7fc`, and removed the orange customer/auth brand override.
  Authentication surfaces and menu rails now use shared canvas/surface tokens;
  white cards across the customer and role styles now use the surface token.
  Food/grocery/transport colors remain service accents. The corresponding regression
  test checks the customer, sign-in, and partner theme selectors.
- `src/design-system/stitch.css`: removed competing global brand, strong-brand,
  canvas and border definitions. Welcome wordmark/buttons and cart shadows now
  consume the shared tokens. Existing layout and service-specific styles retained.
- `src/design-system/CatalogState.tsx`: loading exposes busy state; empty and
  no-results outcomes expose a status announcement; failures remain alerts.
- `server/mobileFoundations.test.mjs`: regression coverage for all four catalog
  states, descriptive content and the retry action.
- Local integration repairs, **not included in the standalone commit**:
  `src/components/CustomerApp.tsx` wallet checkbox now updates the existing
  `paymentMethodChoice` state (`wallet` / `online`); removed the redundant second
  `updateMerchantCatalog` export in `src/data/firebaseHelper.ts`, retaining the
  existing callable implementation. These repair pre-existing pending work.

## Verification

- Baseline `npm test`: passed (Functions, UI, server and secret scan).
- Baseline `npm run lint`: failed on removed wallet setter and duplicate catalog
  implementation; after local repairs, TypeScript completed without diagnostics.
- `npm run build`: passed in development mode; large-chunk warning remains.
- Targeted foundation/navigation/Stitch tests: **12 passed, 0 failed**.
- TASK-02 `npm run lint`: passed.
- TASK-02 `npm test`: **113 passed, 0 failed** across Functions, UI, server and
  secret-scan checks.
- TASK-03 `npm run lint`: passed.
- TASK-03 `npm test`: **114 passed, 0 failed** across Functions, UI, server and
  secret-scan checks.
- TASK-03 `npm run build`: passed; Vite still reports the existing `accounts` chunk
  above 500 kB.
- TASK-04: centralized control height/radius, kept customer/partner controls at
  the 44px touch target, raised form text to 16px, unified focus color, and added
  pressed feedback that honors reduced motion. `npm run lint`, `npm test`
  (**115 passed, 0 failed**) and `npm run build` passed. Native device checks remain
  outstanding.
- TASK-05: added shared card padding/gap tokens and applied the 20px radius,
  semantic border/surface and card shadow to service, food, grocery and ride cards.
  `npm run lint`, `npm test` (**116 passed, 0 failed**) and `npm run build` passed.
  Visual comparison at the target phone widths remains outstanding.
- TASK-06: consolidated legacy, grocery and shared back-button variants around
  44px semantic controls and common title styles; safe-area top padding now uses
  the token with a zero fallback. `npm run lint`, `npm test` (**117 passed,
  0 failed**) and `npm run build` passed. Native notched-device QA remains pending.
- TASK-07: constrained shared bottom navigation to 448px, centered it in the
  phone canvas and switched bottom inset spacing to the shared safe-area token.
  Existing active-tab and cart-count accessibility labels are covered by the
  navigation render test. `npm run lint`, `npm test` (**118 passed, 0 failed**)
  and `npm run build` passed. Device-width visual QA remains outstanding.
- TASK-08: feedback-dialog label IDs are unique across mounted dialogs; action
  buttons cannot submit surrounding forms. Address sheets have a non-announced
  visual handle, and both modal backdrops blur while entrance motion respects
  reduced-motion settings. `npm run lint`, `npm test` (**120 passed, 0 failed**)
  and `npm run build` passed. Native focus and sheet-animation QA remains pending.
- TASK-09: catalog and shared status panels now share card/icon treatments and a
  reduced-motion-aware loading skeleton; accessible busy/error announcements and
  retry actions remain intact. `npm run lint`, `npm test` (**121 passed, 0 failed**)
  and `npm run build` passed. Route-by-route visual QA remains outstanding.
- TASK-10: fixed shells, cart docks, booking pages, checkout and address surfaces
  now use the shared safe-area tokens; native environment values resolve to `0px`
  when no inset is supplied. `npm run lint`, `npm test` (**122 passed, 0 failed**),
  `npm run build` and `git diff --check` passed. A pre-existing Android address-screen
  screenshot is present in the repository, but its capture provenance is unknown and
  it does not establish a connected-device test in this session. Current screenshots
  at 360/390/430px remain pending: the preview browser returned `ERR_NETWORK_CHANGED`
  for localhost. No phone was connected for this work.
- TASK-11: refreshed the welcome screen with a layered indigo background, compact
  logo mark, service icon orbit, high-contrast account actions and a short-height
  layout. Existing signup/onboarding and sign-in destinations remain intact.
  `npm run lint`, `npm test` (**123 passed, 0 failed**) and `npm run build` passed;
  visual screenshots remain pending while the preview browser cannot load localhost.
- TASK-12: onboarding steps now announce copy changes, expose selected progress
  state to assistive technology, animate the copy only when motion is allowed, and
  scale the illustration for short viewports. The existing skip-to-sign-in and
  account creation paths remain available. `npm run lint`, `npm test` (**124
  passed, 0 failed**) and `npm run build` passed; responsive visual checks remain
  pending while localhost preview is blocked.
- TASK-13: password visibility now resets when leaving a sign-in mode, and its
  toggle exposes the controlled field and pressed state to assistive technology.
  Sign-in errors retain a stable alert ID. `npm run lint`, `npm test` (**125
  passed, 0 failed**) and `npm run build` passed; mobile visual verification remains
  pending.
- TASK-14: added a four-level signup password strength indicator based on length
  and character variety, aligned the password field with the backend's 128-character
  limit, and added terms/privacy copy that links to only the configured HTTPS policy
  URLs. `npm run lint`, `npm test` (**127 passed, 0 failed**) and `npm run build`
  passed; screenshots remain pending because the local preview is unavailable.
- TASK-15: both phone OTP flows now autofocus the six-digit field, use numeric
  autofill/paste-friendly entry and display a resend countdown. The legacy native
  flow now normalizes common phone formatting and starts its 60-second cooldown
  only after a successful provider request. `npm run lint`, `npm test` (**128
  passed, 0 failed**) and `npm run build` passed; device SMS/email verification
  remains required.
- TASK-16: password recovery now explains the code/link flow, provides a distinct
  instructions panel and requires matching new-password entries before the account
  API is called. Firebase reset-link behavior remains unchanged. `npm run lint`,
  `npm test` (**129 passed, 0 failed**) and `npm run build` passed; live provider
  delivery remains pending.
- TASK-17: the customer dashboard now announces active booking status changes and
  its tracking action opens that exact booking. Personalized address selection,
  catalog search and service navigation remain data-backed. `npm run lint`,
  `npm test` (**130 passed, 0 failed**) and `npm run build` passed; mobile
  screenshots remain pending.
- TASK-18: saved addresses can now be searched by label or address, selected state
  is exposed with `aria-pressed`, the default badge includes a star, and address
  type buttons have a named group. `npm run lint`, `npm test` (**131 passed, 0
  failed**) and `npm run build` passed; mobile sheet and geolocation checks remain
  pending.
- TASK-19: global search now offers in-session recent-query chips, All/Food/Grocery
  filters and service-tagged result cards with current catalog prices. The search
  remains debounced and server-backed, with retry and pagination intact. Regression
  tests plus `npm run lint`, `npm test` (**133 passed, 0 failed**) and `npm run build`
  passed; mobile suggestion layout remains pending.
- TASK-20: the six service cards now show action tags and reduced-motion-aware
  icon movement, while planned services remain disabled. The directory explains
  that timing and pricing depend on address and request details rather than
  displaying unconfigured estimates. `npm run lint`, `npm test` (**133 passed, 0
  failed**) and `npm run build` passed; screenshots remain pending.
- TASK-21: order updates now expose machine-readable timestamps and a screen-reader
  unread label; selecting an update continues directly to that order. Functional
  regression checks pass; `npm run lint`, `npm test` (**134 passed, 0 failed**) and
  `npm run build` passed; mobile visual QA remains pending.
- TASK-22: restaurant cards now show a catalog-backed vegetarian/menu badge and
  style the partner-provided delivery estimate as a pill, alongside cuisine,
  image and rating. `npm run lint`, `npm test` (**135 passed, 0 failed**) and
  `npm run build` passed; responsive visual checks remain pending.
- TASK-23: restaurant discovery now filters on live cuisine values, keeps search
  and filter controls sticky, and exposes active criteria with individual removal
  and a clear-all action. `npm run lint`, `npm test` (**136 passed, 0 failed**) and
  `npm run build` passed; mobile visual QA remains pending.
- TASK-24: restaurant details highlight the partner's published rating and menu
  type, clarify checkout verification, and point customers with dietary needs to
  the restaurant for ingredient/allergen questions. `npm run lint`, `npm test`
  (**137 passed, 0 failed**) and `npm run build` passed; mobile visual QA remains
  pending.
- TASK-25: the existing live menu keeps its sticky category rail, image cards,
  variant prices and closed-restaurant gating; the vegetarian marker now has an
  explicit screen-reader role and label. `npm run lint`, `npm test` (**137 passed,
  0 failed**) and `npm run build` passed; mobile visual QA remains pending.
- TASK-26: dish details now use a food-specific missing-image placeholder; rendered
  checks cover dietary data, supplied/missing allergen information, live variant
  pricing and the add-to-cart action. `npm run lint`, `npm test` (**138 passed,
  0 failed**) and `npm run build` passed; mobile visual QA remains pending.
- TASK-27: menu variant choices now use accessible radio controls with each current
  price visible. Add-ons are not exposed because catalog storage and checkout
  pricing currently have no partner-configured add-on contract; that work remains
  open rather than showing non-functional options. `npm run lint`, `npm test`
  (**138 passed, 0 failed**) and `npm run build` passed.
- TASK-28: cart quantity buttons now meet the 44px touch target and announce the
  current quantity. Existing service/partner isolation and server-quoted checkout
  breakdown are covered. `npm run lint`, `npm test` (**139 passed, 0 failed**) and
  `npm run build` passed; tip selection remains open pending payout accounting.
- TASK-29: checkout now keeps the server total visible while bill line items can
  collapse, and shows the configured cancellation policy or a clear unavailable
  message. Coupon entry remains in the preceding cart step. `npm run lint`,
  `npm test` (**140 passed, 0 failed**) and `npm run build` passed; mobile QA remains
  pending.
- TASK-30: successful checkout now shows a dedicated order reference and tracking
  action, distinguishing verified online/wallet payments from COD placement.
  The pricing API has no delivery ETA field, so the confirmation directs customers
  to tracking for partner updates instead of showing a made-up time. `npm run lint`,
  `npm test` (**141 passed, 0 failed**) and `npm run build` passed; mobile QA remains
  pending.
- TASK-31: food tracking now maps current booking states to five restaurant-specific
  milestones, including ready-for-pickup and arrived. Stale-location guards remain
  unchanged. `npm run lint`, `npm test` (**142 passed, 0 failed**) and `npm run build`
  passed; mobile visual QA remains pending.
- TASK-32: food order details now show a downloadable itemized receipt and the
  recorded server price breakdown, including tax when supplied. Older bookings
  without a breakdown disclose that limitation; restaurant questions route to
  AllGo support because direct merchant contact data is absent. The download is
  explicitly an order receipt, not a tax invoice. `npm run lint`, `npm test`
  (**143 passed, 0 failed**), `npm run build` and `git diff --check` passed. No
  physical-device verification was performed.
- TASK-33: completed-order reviews now offer selectable quick feedback tags that
  are included with written feedback and bounded to the server's 1,000-character
  limit. The existing reorder flow still opens the current catalog to recheck
  prices and availability. `npm run lint`, `npm test` (**144 passed, 0 failed**),
  and `npm run build` passed. Physical-device QA remains pending.
- TASK-34: grocery discovery now shows a compact partner-timing badge only when a
  store has published an estimate, and includes a quick store switcher that
  respects the single-store cart lock and resets catalog filters. No generic
  delivery-time guarantee was added. `npm run lint`, `npm test` (**145 passed,
  0 failed**), `npm run build` and `git diff --check` passed. Physical-device QA
  remains pending.
- TASK-35: grocery store cards now distinguish accepting, closed and unknown
  order status, show the partner's published estimate, and explain the single-store
  cart restriction. Store records expose no distance or delivery-fee fields, so
  neither is presented as verified. `npm run lint`, `npm test` (**146 passed,
  0 failed**), `npm run build` and `git diff --check` passed. Physical-device QA
  remains pending.
- TASK-36: grocery categories now render as selectable cards with the existing
  category-specific pastel icon backgrounds, a clear active glow, keyboard focus
  styling and accessible pressed state. `npm run lint`, `npm test` (**147 passed,
  0 failed**), `npm run build` and `git diff --check` passed. Physical-device QA
  remains pending.
- TASK-37: grocery product cards now give optional catalog brand and unit size
  clear visual hierarchy beside the current price and stock state. No crossed-out
  MRP is shown because the catalog has no MRP field. `npm run lint`, `npm test`
  (**148 passed, 0 failed**), `npm run build` and `git diff --check` passed.
  Physical-device grid QA remains pending.
- TASK-38: grocery product details now distinguish partner-listed, missing,
  malformed and expired expiry dates; expired or invalid dates remain unavailable.
  Available specs are shown, while absent nutrition data is stated plainly.
  `npm run lint`, `npm test` (**149 passed, 0 failed**), `npm run build` and
  `git diff --check` passed. Physical-device QA remains pending.
- TASK-39: grocery search now includes published brand, ingredient and allergen
  text with native catalog suggestions, and sorting uses direct name/price chips.
  Allergen toggles exclude only products declaring the selected allergen and warn
  that missing data is not an allergen-free claim. `npm run lint`, `npm test`
  (**150 passed, 0 failed**), `npm run build` and `git diff --check` passed.
  Physical-device QA remains pending.
- TASK-40: grocery quantity controls now keep 44px touch targets, provide a brief
  pressed response with reduced-motion support, and explain stock/30-item limits
  including carts exceeding current stock. `npm run lint`, `npm test` (**151
  passed, 0 failed**), `npm run build` and `git diff --check` passed. Physical-device
  touch QA remains pending.
- TASK-41: grocery carts now flag missing, expired and insufficient-stock items,
  block checkout until each conflict is resolved, and offer a route back to the
  same store to browse alternatives. Existing itemized prices remain visible.
  No free-delivery bar was added because no such threshold is supplied by the
  pricing contract. `npm run lint`, `npm test` (**153 passed, 0 failed**),
  `npm run build` and `git diff --check` passed. Physical-device QA remains pending.
- TASK-42: grocery checkout now accepts store-specific handoff instructions and
  an optional contactless preference, recorded through the existing order notes
  field within its 500-character limit. The preference is explicitly not
  guaranteed. Checkout says scheduled delivery slots are unavailable because
  the current API has no slot reservation contract. `npm run lint`, `npm test`
  (**154 passed, 0 failed**), `npm run build` and `git diff --check` passed.
  Responsive visual and physical-device QA remain pending.
- TASK-43: grocery tracking now uses grocery-specific milestones and a confirmed
  packed-line count. It surfaces the assigned delivery partner using existing
  booking data and shows a decreasing arrival estimate only while a fresh route
  to drop-off is available. Picker notes are explicitly unavailable because
  the backend has no customer-facing note field. Automated status, packed-line,
  and display-condition checks pass. `npm run lint`, `npm test` (**157 passed,
  0 failed**), `npm run build` and `git diff --check` passed. Responsive visual
  and physical-device QA remain pending.
- TASK-44: Buy Again now resolves previous grocery lines against the selected
  store's current catalog and supports one-tap adding the available items to the
  cart. It identifies limited stock, out-of-stock, expired/missing items and
  requires the matching store catalog before claiming availability. Existing
  cart store/service guards remain in force. `npm run lint`, `npm test`
  (**159 passed, 0 failed**), `npm run build` and `git diff --check` passed.
  Responsive visual and physical-device QA remain pending.
- TASK-45: parcel entry now introduces local and intercity delivery clearly and
  lists the three latest AllGo parcel records, including completed orders. The
  backend quote contract supports local/intercity route classes but no separate
  same-day or express service tier, so those options are not presented as
  available. `npm run lint`, `npm test` (**160 passed, 0 failed**),
  `npm run build` and `git diff --check` passed. Responsive visual QA remains
  pending.
- Production configuration check: **blocked**, as expected; no bypass added.
- Browser preview: attempted, but localhost access timed out; shell HTTP access
  reported socket permission denial. Responsive visual and native keyboard/safe-area
  QA are **not verified** by this run.
- Repository-wide diff whitespace check reports existing issues in pending files;
  scoped staged changes are checked separately before commit.

## Checklist and continuation order

- [x] Inspect origin/base state and preserve existing work.
- [x] Identify source modules, discover REA and run baseline checks.
- [x] Fix competing global theme overrides and catalog announcements.
- [x] Add the shared typography size, line-height and weight scale.
- [x] Consolidate root brand, canvas and authentication/catalog surfaces.
- [x] Add shared control height, input sizing, focus and reduced-motion feedback.
- [x] Apply shared card radius, spacing, surface and elevation tokens.
- [x] Unify common heading/back-button styles and tokenized safe-area padding.
- [x] Constrain bottom navigation and apply shared safe-area spacing.
- [x] Improve dialog IDs, backdrop treatment, sheet affordance and motion handling.
- [x] Align loading, empty and error states across catalog and shared status panels.
- [x] Repair the two local TypeScript blockers.
- [ ] Complete design-system consolidation and 360/390/430px visual QA.
- [ ] Verify customer/merchant/driver/admin entry routing and auth/OTP end to end.
- [ ] Validate food, then grocery, then parcel, then rides/transport workflows.
- [ ] Validate merchant, driver and admin operational workflows.
- [ ] Verify payment/webhook/refund idempotency, maps, dispatch and location privacy
  with configured non-production services and security-rule emulators.
- [ ] Supply production configuration and acceptance evidence; build and test
  signed Android/iOS releases on devices before claiming readiness.

Next work must start with the current working tree and this log. Do not reset it,
bulk-stage it or mark UI_PROGRESS tasks complete based on source presence alone.
The initial commit is deliberately independent of pending account and role changes.
