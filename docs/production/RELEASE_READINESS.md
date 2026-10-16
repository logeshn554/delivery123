# Release readiness

**Not ready for release.** Updated 2026-10-16.

React 19/TypeScript/Vite and Capacitor Android/iOS targets already exist. No framework migration is needed for this increment. Android source/build presence does not establish native provider functionality; iOS has not been tested on this Windows host.

All master acceptance gates remain open: customer journeys, merchant/driver integration, deployed authorization, provider payments, consistent accessible UI, Android/iOS device journeys, external infrastructure, critical defect closure, and release documentation with operator-reviewed evidence.

Current verified scope: baseline local TypeScript/tests and four booking-scope regression tests. See TEST_RESULTS.md for current evidence; docs/audit contains historical results that must not be presented as this run's acceptance.

Run `node scripts/check-release.mjs --environment=staging`, then production when appropriate. Do not invent acceptance records to pass these gates. Keep the original independent service workflows, default-deny rules, provider verification and explicit unavailable states.
