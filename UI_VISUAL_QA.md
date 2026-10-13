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
