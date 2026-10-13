# AllGo source audit and mobile redesign — 13 October 2026

Implemented in the existing React/TypeScript/Vite + Capacitor checkout on `redesign/allgo-unified-mobile`, from the local `main` checkout whose origin is the requested `logeshn554/delivery123` repository. No remote update, merge, deployment, database migration or real payment was performed.

This is a verified implementation increment, **not completion of the entire product or production acceptance**. Public authentication layouts have browser evidence. Authenticated customer/driver/merchant/admin layouts and service journeys still require staging acceptance. Their source is retained and common design foundations are updated, but passing a build does not establish their visual or live-service correctness.

## Deliverables

- [All 122 ZIP files, assets, duplicates and reference UI states](zip-inventory.md), with hashes and source metadata in [zip-inventory.json](zip-inventory.json).
- [All 90 existing source modules](app-inventory.json), including imports, functions, explicit screen states, headings, text-size findings and entry reachability.
- [Comparison of all 74 TSX components across both sources](component-comparison.md).
- [Journey comparison and screen acceptance checklist](journey-acceptance.md).
- [Unified design system](design-system.md).
- [Changes, verification and remaining work](implementation.md).
- [Browser screenshots](screenshots/): actual startup, authentication and account recovery UI, without test identities or fabricated bookings.

Reproduce the source inventory with `node scripts/audit-ui-reference.mjs "E:/delivery 2/reference-untitled"`. Inventory reads and parses reference files; it does not run them or expose configuration contents. The extracted archive is outside the application at `E:/delivery 2/reference-untitled`.

## Architecture and preservation decisions

The app has six supported booking service types: food, grocery, ride, parcel, driver hire (`takeover`) and vehicle transport. The customer UI is largely state-driven inside CustomerApp, with separate booking, catalog, tracking and account components. App lazily mounts customer, driver, merchant or administrative interfaces from the authenticated profile. The account provider can use the existing Neon API or Firebase; service identity bridges remain untouched. The Firestore helper, callable Functions, server quotation, wallet/payment authorization, participant ownership, stock reservation, dispatch eligibility and immutable reviews remain authoritative.

Native packaging already exists for Android and iOS through Capacitor. Android driver location uses its existing consent-aware native service. Provider authentication, App Check and messaging depend on real platform configuration. This change keeps that architecture. Admin operations retain their own desktop layout and are not inserted into customer navigation.

The ZIP is a source snapshot rather than a screenshot handoff. It contains connected, visually detailed customer components alongside reduced integration stubs. Notable risks discovered in the reference include fabricated payment identifiers in `src/payments.ts`, sample identity/address/wallet defaults, hard-coded transport pricing, timer-generated movers quotes and static offer claims. Those behaviors were **not adopted**. The reference’s clean card hierarchy and service accents are compatible with the existing food/grocery/ride/parcel styling; the stronger live workflows are retained.

There is no complete app-wide user-selectable dark theme. Customer and partner surfaces use light tokens; the administrative console retains its existing dark operations workspace. Full theme switching is remaining work, not a supported feature inferred from a few dark cards.

## Current readiness

Local compile, automated regressions and emulator authorization evidence support further review and staging testing. They do not establish end-to-end production readiness. The configured Neon preview currently stops at account reconnect because its API is unavailable. The public auth screens were checked with the existing Firebase provider in a separate, ignored local preview configuration. No account was created, OTP sent, password reset requested, or payment submitted. Native Firebase provider files are missing; iOS compilation and physical-device acceptance remain unverified.
