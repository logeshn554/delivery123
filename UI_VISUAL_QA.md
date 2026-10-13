# AllGo visual QA

## Customer home

Code review confirms the home routes retain the existing workflow state handlers and catalog subscriptions. Responsive CSS uses two equal columns with `minmax(0, 1fr)` and a narrow-width adjustment at 370px. Restaurant preview now exposes loading, error with retry, populated and empty states.

Screenshots and device render checks remain pending because no authenticated test session or browser automation was available in this workspace. No visual comparison or end-to-end workflow claim is made.

`npm run lint`, `npm run build` and `git diff --check` passed. The build reported an existing large chunk warning. The initial sandboxed `npm run dev` attempt failed with `listen EPERM` on port 3000. Running the dev server with additional permissions succeeded and an HTTP HEAD request returned 200.

After shopping refinements, `npm run lint`, `npm run build`, and all five `tests/ui/*.test.ts` tests passed. Browser rendering, 360/390/430px screenshots, and authenticated checkout still require an environment that permits a local server and authorized test data.

After logistics changes, TypeScript and build checks passed. The transport fare still requires an authorized quote service and payment test to verify the full booking journey. Activity presentation was reviewed against the `Booking.status` union; live lifecycle behavior remains untested in this environment.

After partner refinements, TypeScript, build and `git diff --check` passed. `npm test` passed 30 function tests, 5 UI tests and 10 server tests, but exited nonzero because the final secrets scan could not spawn `git` in the sandbox (`EPERM`). Running `node scripts/check-secrets.mjs --working-tree` with additional permissions passed (344 snapshots, no recognized secrets). A bounded headless Chromium attempt timed out without producing a screenshot. Driver and merchant role rendering still needs authorized test accounts and working browser automation.

The user confirmed that no staging environment is available. Authenticated customer, driver and merchant journeys, payment verification and provider backed tracking cannot be honestly marked as tested. Account and support code was reviewed and checked with TypeScript and the build; device rendering remains pending.

After shared form changes, `npm run lint`, `npm run build` and `git diff --check` passed. The build still reports the pre-existing large chunk warning. Address dialog keyboard and screen-reader behavior needs a device or browser pass before it meets the acceptance criteria.

Native build inspection: Android and iOS Capacitor projects are present, but this workspace has no Android SDK or `adb`, and no macOS/Xcode environment. The native Firebase configuration files are absent; `scripts/prepare-native.mjs` intentionally omits native Firebase plugins in that state. Android and iOS smoke tests and native provider acceptance are therefore pending.
# 13 October 2026 Stitch welcome verification

## Location setup reference

Compared `3._location_setup/screen.png` and `code.html` with the real saved-address selector. The production list now follows the reference's compact Home/Work-style rows and dashed Other Location action, using each account's actual saved labels and addresses. Device geolocation remains in the existing lookup component. No live map screenshot, permission run, or device comparison is available.

The customer app now mounts this sheet directly; its former duplicate address modal was removed. This was verified by source review and TypeScript compilation, not by an authenticated runtime session.

## Edit address reference

Inspected the supplied `edit_address/screen.png` and `code.html`. The reference includes editing existing address fields and saving changes. The current application has no address update operation, so the working add/default/delete controls were preserved. Edit, map-pin movement, phone field, and Save Changes are not claimed as implemented. Authenticated account testing is pending.

## Restaurant menu reference

Compared `food_restaurant_menu/screen.png` and `code.html` with the real `RestaurantMenu`. Its existing hero, category rail, menu cards and cart dock use catalog data. The card image and Add button now sit on one row as in the reference, with variant quantity controls below when needed. No authenticated catalog or rendered screenshot comparison is available.

The real customer food workflow now mounts `RestaurantMenu` with its existing data and handlers. The former duplicate menu markup is removed; this was checked in source and by TypeScript, not with an authenticated screenshot.

## Grocery home and products references

Compared `10._grocery_home` and `11._grocery_products` screenshots and HTML with the production grocery workflow. The home heading now matches the reference language, and the two-column catalog uses the shared Stitch product card in the actual customer flow. Product stock and partner availability still come from live records. Reference sample stores and category imagery were not copied into production. Catalog interaction and rendered screenshots remain unverified.

## Ride, vehicle transport and movers references

Compared `13._ride_booking`, `14._bike_transport`, and `17._packers_movers` with production booking components. The ride route now presents the Stitch selection rows and violet primary action while retaining server quotes. The transport flow needs actual vehicle details and a server quote; the sample fare and bike-only layout were not asserted for car transport. Movers remains explicitly planned, with disabled requirements and support access. No provider quote, payment or device screenshot was verified.

## Offers and profile references

Compared `20._offers_coupons` and `21._profile` with the production account flow. Their Stitch components now render in the real customer app. Account actions use the existing routes and signed-in fields. The offers screen opens from the bottom tab and profile, and a typed code moves into cart review for the existing server eligibility check. The reference's sample offers, verified labels, person and wallet balance were not used. Authentication, coupon preview and rendered screenshots remain unverified.

## Login and sign-up reference

The original `2._login_sign_up/screen.png` and `code.html` were compared with production `AuthScreen`. The sign-in and phone views now include the reference avatar treatment, centered heading, input spacing and violet primary button. The reference's phone-first form cannot be applied to providers that only expose email; native phone remains conditional on its existing provider gate. Screenshot comparison, provider sign-in, and device rendering are unverified.

## Welcome reference

| Item | Result |
| --- | --- |
| Reference | `1._splash_screen/screen.png` and matching `code.html` from the user ZIP |
| Production screen | `src/components/AuthScreen.tsx` welcome state |
| Source comparison | Removed purple monogram, extra heading/copy and service orbit; restored reference wordmark, tagline, supplied courier SVG and bottom actions |
| Interaction | Existing Get Started → onboarding and Login → sign-in handlers retained in source |
| Automated verification | TypeScript lint, Vite build, existing Stitch UI test passed |
| Screenshot comparison | Not verified: headless Chromium timed out and produced no capture |
| Responsive / device | 320/360/390/430 px, Android and iOS device rendering not verified |
| Next | Capture the welcome screen in a functioning browser/device; then compare `2._login_sign_up` |
