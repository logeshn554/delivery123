# UI unification — incremental implementation

## First increment

- Introduced shared brand, surface, border, focus and touch sizing tokens and an accessible reusable bottom navigation.
- Customer activity/account destinations retain existing handlers and backend ownership. Navigation now participates in the flex shell rather than overlapping content, and hides during booking workflows, checkout, catalog detail, order detail and reorder screens.
- Removed the fabricated combined journey builder from the application. Combined bookings remain unavailable until real catalog/location selection, partner queues and operational acceptance are implemented. Backend bundle contracts and existing bundle status component remain intact.
- Bundle status diagram no longer claims geographic GPS tracking or shows the current browser clock as a synchronization timestamp.
- Demo playground remains a separate explicitly labeled demo entry. It does not represent the production customer application.
- Added reusable service tiles and disabled, labeled goods/movers entries. Existing service selections retain their callbacks.
- Role workspace sizing now uses a shared flex shell instead of subtracting a hard-coded header height. Sign out has an accessible name. Customer touch targets use a 44px minimum.

## Remaining work

- Extract customer pages and introduce guarded persistent routes with native/browser back behavior.
- Consolidate remaining role workspaces, dialogs, forms, checkout and tracking styles.
- Build real bundle catalog selection and fulfillment integration.
- Add server-driven service availability.
- Verify responsive layouts, keyboard interactions, focus management, screen reader semantics and browser/device routes.
- Integrate real staging identity, payments, maps, notifications and partner fulfillment. Android/iOS physical acceptance and iOS compilation remain unverified.

This increment does not establish production readiness. Local component regressions do not replace interaction or staging acceptance.

## Second increment

- Added owner-scoped paginated combined journey history under Activity and reopenable tracking. The composite history index is committed as configuration, not deployed.
- Added positive owner-query and negative cross-account/unscoped-query rules regressions.
- Bundle tracking now resets state on context switches, guards late callbacks, times out an initial stalled read and surfaces missing stop data instead of silently logging it.
- Chat no longer fabricates a sender identity when authentication is missing; input has an accessible name and a bounded length.
- Reviewed shared native configuration and documented platform/backend connections and newly identified release blockers in `docs/architecture/platform-connections.md`.

### Local verification

- TypeScript check passed after the history/listener changes.
- Isolated Firestore rules and integration suite: 90 passed, including owner-scoped history queries. Provider calls are mocked; this is not live acceptance.
- Web development build and Android sync passed; Android debug compilation passed (38 seconds).
- iOS web asset sync passed; CocoaPods dependency installation and Xcode compilation were skipped because those tools are unavailable on Windows. This is not an iOS build pass.
- Native Firebase configuration remains missing for both platforms; development preparation omitted those providers.
- Bundle accordion keyboard semantics and honest fulfillment labels are included in the latest Android-synced debug APK. The APK installed and opened on a physical Android device, but the captured screen remained at the account-server reconnect state because the local API was not started against an unverified hosted Neon database. This is launch evidence, not service-journey or visual acceptance.
