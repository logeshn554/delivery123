# Unified AllGo mobile design system

The centralized sources are `src/design-system/tokens.css` and `mobile.css`, loaded after the existing Tailwind/service styling. Service-specific cards keep their established food/grocery/ride/parcel accents while sharing readable type, touch controls, surfaces and navigation. The legacy styles remain where a replacement could disrupt a working screen; this is an incremental consolidation, not removal of all hard-coded styling.

| Foundation | Specification |
|---|---|
| Brand/action | `--allgo-brand` #5130EF; strong #4021CC |
| Text | Ink #201D2B; secondary #635D72 |
| Surfaces | White; canvas #F7F6F9; border #E5E1ED |
| Semantic feedback | Success #176342/#EAF9F1; danger #AC3333/#FFF0EF; warning #7A4C00/#FFF7E5 |
| Service accents | Food #EE7D43, grocery #20835A, ride #4164C8, parcel #7659C9; accents are supplemented by text and icons |
| Typography | System-font fallback after Inter; no new font download. Caption minimum 12px, body 14px, input 16px, page title 24px; bold headings with normal wrapping |
| Spacing | 4, 8, 12, 16, 20, 24px tokens; larger layout spacing in existing service styles |
| Radius | Controls 14px, general cards 16px, feature/dialog cards 20px |
| Elevation | Subtle card shadow; stronger overlay shadow; border for surface separation |
| Touch | 44px minimum; primary auth 52px and secondary auth 50px; icon buttons require named actions |
| Focus | Visible 3px focus outline for interactive elements; programmatic heading focus after auth/store navigation |
| Safe areas | Shared top/bottom values honor native overrides or environment insets; navigation padding is added to, rather than substituted for, bottom safe area |
| Motion | Short existing transitions; loading spin only where appropriate; global reduced-motion handling remains |

## Reusable components and behavior

- `BottomNavigation`: customer, driver and merchant landmarks, active destination via `aria-current`, cart counts, semantic buttons and safe-area padding. Driver Deliveries/History/Earnings/Support and merchant Orders/Catalog/Settings use actual existing handlers.
- `PageHeading`: wrapping title, description, optional named back button and optional action. Back is `type="button"` to avoid accidental form submission. Merchant panels reset scroll and focus the heading while retaining editors in mounted hidden sections, preserving unsaved field state.
- `StatusPanel`: loading, empty and error presentations with different assistive announcement roles. Existing `CatalogState` retains its catalog-specific retry/no-results states; no fictitious result is substituted.
- `CatalogImage`: existing lazy-loaded image/fallback component is retained. Missing images do not create substitute catalog records.
- Existing service tiles, category filters, quantity controls, quote cards, checkout review, booking timeline, tracking, receipts, account links and form validation continue using their actual data and callbacks.
- Feedback dialogs use a bounded scrolling surface; existing native dialog focus/Escape behavior remains. Auth navigation restores top position, moves screen-reader focus and handles native back events.
- Offline feedback is positioned below the device top inset. ResizeObserver measures its real height and offsets the app, including wrapped or enlarged text. The message warns that recorded payment/tracking data may be stale.

## Role and platform decisions

Partner screens use the same light surface/brand palette; merchant status accents now have readable light-surface contrast. Driver background content becomes inert while a subview is open, and bottom navigation remains accessible. Administrative controls get the shared touch/input/caption sizing within their existing desktop workspace.

Android launch styling uses a code-native white AllGo A mark on the shared purple background for both legacy and modern splash themes. iOS launch uses a centered static system-font A on the same background. Stock Capacitor launch imagery is no longer referenced by these launch surfaces; old assets remain preserved. Android compilation is checked, but visual splash/device behavior and iOS storyboard compilation must be accepted on devices/Xcode.

No ZIP raster asset, fixed fare, dummy order, sample personal information or payment stub is copied into the application. No third-party image rights are assumed. The unchanged package iconography and existing app assets remain the asset source.
