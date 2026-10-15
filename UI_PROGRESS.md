# AllGo — Autonomous UI Development Progress & Screen Inventory

Repository: `https://github.com/logeshn554/delivery123.git`  
Design Standard: AllGo Unified Design System (Electric Indigo primary `#5130EF`, Service Palette: Food `#EE7D43`, Grocery `#1B8B5A`, Ride `#3B66D4`, Parcel `#7659C9`, Movers `#C47B25`).  
Target Platforms: Responsive Mobile Web at 360px, 390px, and 430px; Android (Capacitor); iOS (Capacitor). Physical-device and screenshot provenance is tracked separately from source-level checks.

---

## Executive Status Overview

2026-10-14 source reconciliation: see
[`docs/audit/2026-10-14-production-foundations.md`](docs/audit/2026-10-14-production-foundations.md).
TASK-10 now routes platform safe-area spacing through shared top/bottom tokens
with zero fallbacks. Its responsive visual check remains pending because the
local browser preview cannot reach the development server in this environment.
TASK-11 now has a consistent electric-indigo welcome hero, white high-contrast
primary action, preserved sign-in/signup routing, and a compact-height layout.
TASK-12 now announces onboarding step changes, exposes directly selectable step
controls, honors reduced motion and scales its illustration for short screens.
TASK-13 now resets password visibility on navigation, exposes the visibility
toggle state and control relationship, and gives the sign-in error a stable alert ID.
TASK-14 now adds a bounded password-strength meter and a signup policy disclaimer
that links to the configured HTTPS terms and privacy pages.
TASK-15 now autofocuses six-digit SMS inputs, uses numeric/paste-friendly entry,
and exposes the resend cooldown in both configured phone sign-in paths.
TASK-16 now explains reset delivery, provides password confirmation and validates
the replacement pair before sending it to the account API.
TASK-17 now announces booking-status changes and opens the selected active booking
directly from the customer dashboard. Existing service cards, catalog search and
address selector remain connected to live app data.
TASK-18 now filters saved addresses by label or street, exposes selected/default
state accessibly, and labels the address-type controls as a group.
TASK-19 now adds service filters, recent in-session query chips, compact priced
result cards and a close/Escape path for the global search suggestions.
TASK-20 now gives every live service a clear action tag and adds reduced-motion-
aware card movement; the directory clarifies estimates vary by address and request.
TASK-01 has a scoped implementation removing competing global Stitch theme tokens;
TASK-09 now announces catalog busy/empty/error states consistently (targeted tests
passed). TASK-02 has a shared type scale and line-height/weight tokens, applied to
shared headings, auth text, form labels and status panels. TASK-03 now uses semantic
canvas/surface and brand tokens across auth, customer and catalog styles; service
accents remain scoped. The inventory is a backlog, not proof of missing code or
production readiness; phase totals remain unchanged until full visual and functional
acceptance. TASK-01 through TASK-09 remain in progress until their
remaining visual and functional checks are recorded.

| Phase | Category | Total Tasks | Completed | In Progress | Pending | Blocked |
|---|---|---|---|---|---|---|
| **Phase 1** | Foundations | 10 | 0 | 10 | 0 | 0 |
| **Phase 2** | Customer Entry | 11 | 0 | 10 | 1 | 0 |
| **Phase 3** | Food Delivery | 12 | 0 | 0 | 12 | 0 |
| **Phase 4** | Grocery Delivery | 11 | 0 | 0 | 11 | 0 |
| **Phase 5** | Parcel Delivery | 11 | 0 | 0 | 11 | 0 |
| **Phase 6** | Transport & Rides | 13 | 0 | 0 | 13 | 0 |
| **Phase 7** | Customer Activity | 8 | 0 | 0 | 8 | 0 |
| **Phase 8** | Account & Settings | 14 | 0 | 0 | 14 | 0 |
| **Phase 9** | Driver App | 13 | 0 | 0 | 13 | 0 |
| **Phase 10** | Merchant Portal | 11 | 0 | 0 | 11 | 0 |
| **Phase 11** | Operations & Admin | 11 | 0 | 0 | 11 | 0 |
| **Total** | | **125** | **0** | **21** | **104** | **0** |

---

## Phase 1 — Foundations (Tasks 01 – 10)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-01** | Design-token consolidation | `src/design-system/tokens.css`, `src/index.css`, `src/design-system/stitch.css`, `src/design-system/mobile.css` | Disjointed tokens, missing variables in `tokens.css` referenced by `mobile.css`, competing brand colors (`#5130ef` vs `#5b4df5` vs `#ff5428`) | Consolidate 3-layer token system (primitive -> semantic -> component) in `tokens.css`; unify brand indigo `#5130EF`; fix missing radius, safe area, elevation, typography tokens; remove conflicting overrides | **In Progress** | Pending | Lint/Build Pending | Complete token consolidation in `tokens.css`, sync with `index.css`, `stitch.css`, `mobile.css` |
| **TASK-02** | Typography | `src/design-system/tokens.css`, `src/index.css`, `src/design-system/mobile.css` | Raw pixel sizes scattered across CSS, inconsistent line heights, potential iOS 16px input zoom bugs | Define standard typography scale tokens: display, headline, title, subtitle, body, callout, caption, tiny; ensure inputs >=16px; set line-height & font-weight tokens | In Progress | Pending | Pending | Apply tokens to remaining shared roles and verify mobile layouts |
| **TASK-03** | Color and surface consistency | `src/design-system/tokens.css`, `src/index.css`, `src/design-system/stitch.css` | Inconsistent card backgrounds, mixed border colors, raw hexes | Standardize canvas `#F8F7FC`, card surfaces `#FFFFFF`, border `#EBE8F2`, ink `#1B1726`, muted `#696277`, semantic state colors & service tokens | In Progress | Pending | Pending | Complete the remaining surface and semantic color pass |
| **TASK-04** | Shared buttons and input controls | `src/design-system/tokens.css`, `src/design-system/mobile.css`, `src/index.css` | Button heights vary from 40px to 54px; inconsistent focus rings and active states | Standardize button hierarchy (primary, secondary, outline, ghost, destructive); min 44px touch targets; active micro-scale; accessible focus rings | In Progress | Pending | Pending | Verify focus, reduced motion and mobile control sizing |
| **TASK-05** | Shared cards and service tiles | `src/design-system/ServiceTile.tsx`, `src/design-system/GroceryProductCard.tsx`, `src/design-system/RideOptions.tsx` | Multiple ad-hoc card borders and radii | Standardize card padding, corner radii (20px), subtle elevation shadows, micro-interaction press effects | In Progress | Pending | Pending | Verify service, restaurant, grocery and ride cards in mobile layouts |
| **TASK-06** | Headers and page headings | `src/design-system/PageHeading.tsx`, `src/design-system/mobile.css` | Different headers in customer, driver, merchant, admin | Standardize back-button dimensions (44x44px), title typography, sticky top safe-area insets | In Progress | Pending | Pending | Verify all entry pages and notched-device insets |
| **TASK-07** | Bottom navigation | `src/design-system/BottomNavigation.tsx`, `src/app/customerNavigation.ts` | Stretched full-width on wide displays; inconsistent tab bar badges | Constrain to max-width (448px); safe-area bottom padding; clear active icon and label states; badge indicators | In Progress | Pending | Pending | Verify responsive width and active tab announcements |
| **TASK-08** | Dialogs and bottom sheets | `src/components/useFeedbackDialog.tsx`, `src/components/AddressSheet.tsx` | Ad-hoc modal transitions, scrim opacities | Standardize backdrop blur, bottom sheet drag handle, focus trap, smooth entrance/exit | In Progress | Pending | Pending | Verify modal labels, unique IDs, dismissal and reduced-motion behavior |
| **TASK-09** | Loading, empty and error components | `src/design-system/CatalogState.tsx`, `src/design-system/StatusPanel.tsx`, `src/components/ConnectionStatus.tsx` | Divergent spinner styles, raw error text | Standardize `CatalogState` & `StatusPanel` with animated pulse skeleton, clear error icons, retry CTAs | In Progress | Pending | Passed (loading, empty and error tests) | Verify all catalog and shared fallback layouts |
| **TASK-10** | Global mobile safe-area and responsive behavior | `src/index.css`, `src/design-system/tokens.css`, `src/design-system/mobile.css` | Safe-area paddings inconsistent on notched devices and Android navigation bars | Ensure `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` applied to fixed shells; test at 360, 390, 430px | In Progress | Pending | Passed (shared token and zero-fallback regression test) | Verify layout at all 3 mobile breakpoints |

---

## Phase 2 — Customer Entry (Tasks 11 – 21)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-11** | Welcome screen | `src/components/AuthScreen.tsx` (`screen === 'welcome'`) | Disjointed brand colors (orange logo vs purple system), oversized ghost watermark | Clean brand hero with electric indigo gradient mark, value proposition carousel/orbit, high-impact CTA | In Progress | Pending | Passed (account actions and style regression) | Verify welcome layout at 360/390/430px and on device |
| **TASK-12** | Onboarding | `src/components/AuthScreen.tsx` (`screen === 'onboarding'`) | Simple 3-step text with raw Lucide icon boxes | Polished illustration cards, smooth step transitions, clear progress dots, quick skip action | In Progress | Pending | Passed (step announcements, navigation and reduced-motion regression) | Verify onboarding at 360/390/430px and on device |
| **TASK-13** | Login | `src/components/AuthScreen.tsx` (`screen === 'signin'`) | Functional form, basic inputs | Floating labels or clean modern input containers, password visibility toggle, accessible error alerts | In Progress | Pending | Passed (visibility, recovery and alert semantics regression) | Verify sign-in states at mobile widths and on device |
| **TASK-14** | Signup | `src/components/AuthScreen.tsx` (`screen === 'signup'`) | Basic name/email/password fields | Form hierarchy, inline strength indicator, password show/hide, terms disclaimer | In Progress | Pending | Passed (password strength boundaries and configured policy-link checks) | Verify signup validation and links on device |
| **TASK-15** | OTP & account verification | `src/components/AuthScreen.tsx` (phone), `src/components/VerifyAccount.tsx` | Functional 6-digit input | Modern segmented digit boxes or formatted input, resend timer countdown, auto-focus | In Progress | Pending | Passed (numeric OTP, autofill and cooldown regression) | Verify email and SMS verification on device |
| **TASK-16** | Password recovery | `src/components/AuthScreen.tsx` (`screen === 'reset'`), `src/components/AccountActionScreen.tsx` | Basic email reset trigger | Clear instructions card, confirmation notice, password update form with validation | In Progress | Pending | Passed (recovery instructions and match validation regression) | Verify provider reset and confirmation on device |
| **TASK-17** | Customer home dashboard | `src/components/CustomerApp.tsx` (`currentTab === 'home'`) | Dual-column primary tiles, promo banner, service list | Modern Swiggy/Zepto-style service grid, active order live bar, personalized address header, search bar | In Progress | Pending | Passed (search, address, live status and tracking destination regression) | Verify dashboard at 360/390/430px and on device |
| **TASK-18** | Address selector | `src/components/AddressSheet.tsx`, `src/components/LocationPicker.tsx` | Bottom sheet with saved list & address form | Map pin icon, Home/Work/Other tags, quick search, default address star badge, bottom action | In Progress | Pending | Passed (saved search, selection state and address labels regression) | Verify sheet and location search at mobile widths and on device |
| **TASK-19** | Global search | `src/components/GlobalCatalogSearch.tsx`, `src/components/CustomerApp.tsx` | Functional debounced search across restaurants & products | Instant category pills, recent search chips, rich item result cards with pricing and service tag | In Progress | Pending | Passed (food/grocery filtering and recent-query regressions) | Verify suggestion navigation and results at mobile widths |
| **TASK-20** | Service directory | `src/features/discovery/ServiceDirectory.tsx` | Grid of available services | Vibrant themed service cards with badge tags, delivery times, micro-animations | In Progress | Pending | Passed (all six tags, planned-service gating and reduced-motion regression) | Verify service cards at mobile widths and on device |
| **TASK-21** | Notifications & active-order entry | `src/components/CustomerPages.tsx` (`page === 'notifications'`), `src/components/CustomerApp.tsx` | Basic notifications list | Time-stamped event cards, unread indicators, deep-link to order tracking | In Progress | Pending | Passed (machine-readable timestamps, announced unread state, mark-read and order navigation regression) | Verify notifications and order deep-link at mobile widths and on device |

---

## Phase 3 — Food Delivery (Tasks 22 – 33)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-22** | Restaurant discovery | `src/components/CustomerApp.tsx` (`activeWorkflow === 'food'`) | List of restaurant cards, filter chips | Premium cards with partner imagery, rating, ETA and cuisine; catalog-backed vegetarian menu badge | In Progress | Pending | Passed (catalog data and diet/estimate labels regression) | Verify partner data and cards across mobile widths |
| **TASK-23** | Restaurant search and filters | `src/components/CustomerApp.tsx` | Search bar, veg filter, category chips | Sticky filter bar, sort dropdown, active filter pill indicators | In Progress | Pending | Passed (live cuisine filters, active filter removal, clear-all and sticky controls regression) | Verify cuisine, vegetarian, saved and text search combinations on device |
| **TASK-24** | Restaurant details | `src/components/CatalogDetails.tsx` (`kind === 'restaurant'`) | Modal with restaurant information | Partner image, published rating, delivery estimate, address, menu type, dietary safety guidance | In Progress | Pending | Passed (published data, checkout verification and dietary guidance regression) | Verify restaurant details sheet with live partner records on device |
| **TASK-25** | Restaurant menu | `src/components/RestaurantMenu.tsx`, `src/components/CustomerApp.tsx` | Vertical menu with left category rail | Sticky category rail, dish cards with image, veg dot icon, customizable options | In Progress | Pending | Passed (category navigation, dietary announcement, selected variant pricing and closed-menu regression) | Verify menu and category rail at mobile widths and on device |
| **TASK-26** | Dish details | `src/components/CatalogDetails.tsx` (`kind === 'dish'`) | Detail card for dish | Large food preview, description, dietary tags, price, add-to-cart button | In Progress | Pending | Passed (photo fallback, live variant price, dietary/allergen disclosures and add action regression) | Verify detail sheet and add flow on device |
| **TASK-27** | Variants & customization | `src/components/RestaurantMenu.tsx` | Variant select dropdown | Radio variant selector and live price update; add-ons require catalog schema and merchant configuration support | In Progress | Pending | Pending (variant selection covered; add-on catalog support outstanding) | Verify variant pricing; define partner-managed add-ons before exposing choices |
| **TASK-28** | Food cart | `src/components/CustomerApp.tsx` (`currentTab === 'cart'`), dock | Sticky floating dock and cart view | 44px quantity steppers, server quote breakdown, service/partner cart lock; optional tip remains pending a server pricing and payout contract | In Progress | Pending | Passed (cart isolation, 44px announced quantity controls and server quote regression) | Verify food cart on device; add tip only with verified accounting support |
| **TASK-29** | Checkout review | `src/components/CheckoutReviewScreen.tsx` | Address, items, server price summary, payment methods | Collapsible server bill with visible total, existing cart coupon flow, payment selector, configured cancellation policy link | In Progress | Pending | Passed (bill total, payment options and cancellation-policy states regression) | Verify checkout states and policy link on mobile |
| **TASK-30** | Order confirmation | `src/components/OrderConfirmationScreen.tsx`, `src/components/CustomerApp.tsx` | Inline order/payment notice | Animated checkmark, order reference, COD/paid distinction, tracking CTA; ETA stays pending until quote API supplies one | In Progress | Pending | Passed (paid/COD copy, booking reference and tracking action regression) | Verify paid/COD confirmation and tracking path on mobile |
| **TASK-31** | Food tracking | `src/components/OrderTrackingScreen.tsx` | Live map, partner location and generic order timeline | Food milestones mapped to placed, restaurant confirmed, preparing, out for delivery and arrived | In Progress | Pending | Passed (booking-state to milestone mapping and stale-location guard regression) | Verify food status transitions and live location at mobile widths |
| **TASK-32** | Food order details | `src/components/CustomerApp.tsx`, `src/components/FoodOrderReceipt.tsx` | Order summary list | Downloadable itemized receipt with recorded tax/fee breakdown and support handoff | In Progress | Pending | Receipt render and recorded/missing-breakdown regression | Direct restaurant contact and tax invoice require verified merchant/operator data; physical-device QA pending |
| **TASK-33** | Reviews and reorder | `src/components/CustomerPages.tsx` (`reviews`), `src/components/ShopAgainScreen.tsx` | Form for rating completed order | Accessible star rating, optional quick feedback tags and text; reorder rechecks the current catalog | In Progress | Pending | Quick-tag submission and 1,000-character server-bound regression | One-tap add remains unavailable because current prices, availability and variants must be rechecked |

---

## Phase 4 — Grocery (Tasks 34 – 44)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-34** | Grocery discovery | `src/components/CustomerApp.tsx` (`activeWorkflow === 'grocery'`), `src/index.css` | Store banner, category strip, product grid | Local grocery hero, partner-listed timing badge, compact store switcher with cart lock | In Progress | Pending | Partner timing display and cart-aware switch regression | Delivery timing is partner-provided and must not imply an unverified 10-minute guarantee; physical-device QA pending |
| **TASK-35** | Grocery store selection | `src/components/CustomerApp.tsx`, `src/index.css` | Horizontal store cards | Clear published accepting status and timing, distinct open/closed badges, cart-switch warning | In Progress | Pending | Verified status/timing rendering and missing fee/distance data guard | Catalog exposes no store distance or delivery-fee fields; no estimate is invented; physical-device QA pending |
| **TASK-36** | Grocery categories | `src/design-system/GroceryCategories.tsx`, `src/design-system/stitch.css` | Circular category icon buttons | Rounded selectable cards, pastel icon backgrounds, clear selected glow, labeled categories | In Progress | Pending | Category button semantics, tone mapping and selected/focus states regression | Verify wrapping and horizontal fit at target mobile widths; physical-device QA pending |
| **TASK-37** | Product grid | `src/design-system/GroceryProductCard.tsx`, `src/index.css` | Responsive product cards | Clear image/title hierarchy, optional catalog brand, unit/size pill, live price | In Progress | Unit, brand and live price regression; no MRP shown without catalog field | MRP is not present in grocery product data; physical-device grid QA pending |
| **TASK-38** | Product details | `src/components/CatalogDetails.tsx` (`kind === 'product'`), `src/index.css` | Product details modal with image, specifications and quantity control | Partner-listed expiry badge with fail-closed invalid/expired states, available product specs and a clear quantity selector | In Progress | Future, expired and missing expiry; supplied/missing specs and quantity control regression | Catalog has no nutrition field; physical-device QA pending |
| **TASK-39** | Grocery search & filters | `src/design-system/groceryCatalog.ts`, `src/components/CustomerApp.tsx`, `src/index.css` | Search, stock and saved filters | Native live-catalog suggestions, brand/ingredient search, name/price sort chips, declared-allergen exclusion | In Progress | Search, sort and allergen exclusion regression; warning clarifies only partner-declared allergens are filtered | Product catalog has no vegetarian/vegan certification; no dietary claims inferred; physical-device QA pending |
| **TASK-40** | Product quantity controls | `src/design-system/GroceryProductCard.tsx`, `src/index.css` | Stock-aware quantity stepper | 44px compact stepper with pressed feedback, explicit per-stock/30-item limit notice and reduced-motion support | In Progress | Stock edge cases, cart over-stock and limit notice regression | Haptics are not available in this web flow; physical-device touch QA pending |
| **TASK-41** | Grocery cart | `src/components/CustomerApp.tsx`, `src/design-system/groceryCatalog.ts`, `src/index.css` | Itemized cart, stock refresh and subtotal | Explicit stale/expired/low-stock warnings, same-store replacement browse action and checkout block | In Progress | Missing, expired and insufficient-stock conflict regression | No free-delivery threshold or automatic substitution contract exists; physical-device QA pending |
| **TASK-42** | Grocery checkout | `src/components/CheckoutReviewScreen.tsx`, `src/components/CustomerApp.tsx`, `src/design-system/checkoutNotes.ts` | Shared checkout review | Store-specific instructions and optional contactless preference; do not claim a scheduled slot without a store reservation API | In Progress | Pending | Contactless preference renders only for grocery and is preserved within the existing 500-character order note; explicit unavailable-slot state regression | Delivery-slot booking is unsupported by the current API; visual QA remains pending |
| **TASK-43** | Grocery order tracking | `src/components/OrderTrackingScreen.tsx`, `src/design-system/groceryTracking.ts` | Shared live tracking | Grocery-specific order/packing/handoff milestones, confirmed packed-line count, assigned partner and fresh route-based arrival estimate | In Progress | Pending | Packed-line identity/quantity and status progression regression; ETA only appears for a fresh route to drop-off | Picker notes have no backend field; explicitly shown as unavailable. Device visual QA remains pending |
| **TASK-44** | Buy again | `src/components/ShopAgainScreen.tsx`, `src/design-system/groceryReorder.ts`, `src/components/CustomerApp.tsx` | Past grocery order items | One-tap add of currently available prior grocery items, with live stock, reduced-quantity and missing-product replacement states | In Progress | Pending | Reorder resolver covers available, limited, out-of-stock, expired/missing, and unloaded-store cases; cart guards remain active | Fresh store catalog must be loaded before one-tap add; responsive visual QA remains pending |

---

## Phase 5 — Parcel Delivery (Tasks 45 – 55)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-45** | Parcel entry | `src/components/ParcelBookingScreen.tsx`, `src/components/CustomerApp.tsx` | Stepper with local/intercity route modes | Clear courier hero, route coverage selector, recent AllGo parcel history including completed records | In Progress | Pending | Route-mode and recent-history regression | Backend supports local/intercity, not same-day/express service levels; visual QA remains pending |
| **TASK-46** | Pickup address | `src/components/ParcelBookingScreen.tsx`, `src/components/LocationPicker.tsx`, `src/design-system/parcelInstructions.ts` | Address form & search | Verified pickup route selection and optional floor, gate or landmark access notes | In Progress | Pending | Pickup instructions are passed to the quote in the existing bounded notes field | Pickup and recipient notes share the backend's 500-character limit; visual QA remains pending |
| **TASK-47** | Drop address | `src/components/ParcelBookingScreen.tsx`, `src/components/LocationPicker.tsx`, `src/design-system/parcelInstructions.ts` | Recipient address, phone and delivery access | Recipient address search, required recipient phone, optional floor/gate/landmark, bounded operator instructions | In Progress | Pending | Drop-off access is labeled in quote notes; recipient phone remains required | Pickup, drop-off and handover details share the existing 500-character notes field; visual QA remains pending |
| **TASK-48** | Parcel information | `src/components/ParcelBookingScreen.tsx`, `src/design-system/parcelPackage.ts` | Weight, dimensions, declared value and fragile flag | Accessible package-type tiles, weight/dimension validation, fragile handling label and truthful declared-value disclaimer | In Progress | Pending | Type choices match the quote service allowlist; non-document packages require dimensions | Backend allows Documents, Box, Electronics and Others; unsupported Food/Clothes options are not offered |
| **TASK-49** | Sender & recipient | `src/components/ParcelBookingScreen.tsx`, `firestore.rules`, `functions/parcelPolicy.js` | Name/phone inputs | Separate sender/recipient cards, private-contact notice, recipient update preference | In Progress | Pending | Contacts remain validated and stored separately; privacy copy matches booking_contacts access rules | No recipient SMS subscription is implemented; UI states SMS updates are unavailable rather than offering a nonfunctional toggle |
| **TASK-50** | Booking schedule | `src/components/ParcelBookingScreen.tsx`, `src/design-system/parcelSchedule.ts` | Optional pickup timing request | ASAP/request-time choices, future-time validation and explicit operator-confirmation language | In Progress | Pending | Future-only selection is checked in UI and the quote API; no slot is represented as reserved | Backend provides neither pickup slots nor earliest-availability estimate; visual QA remains pending |
| **TASK-51** | Quote and review | `src/components/ParcelBookingScreen.tsx`, `src/design-system/serviceQuote.ts`, `functions/bookingPolicy.js`, `functions/index.js` | Server fare estimate | Server-calculated base, distance, time, billable-weight, minimum adjustment, discount, route summary and insurance disclaimer | In Progress | Pending | Integer-paise breakdown must reconcile exactly to total and discount; uses configured server rates | Insurance is not priced or included by the service; responsive visual QA remains pending |
| **TASK-50** | Booking schedule | `src/components/ParcelBookingScreen.tsx` | Immediate vs scheduled options | Time slot picker chips, earliest pickup estimate | Pending | Pending | Pending | Polish scheduling interface |
| **TASK-51** | Quote and review | `src/components/ParcelBookingScreen.tsx` | Server fare estimate card | Clear fare breakdown (base, distance, weight, insurance), route summary | Pending | Pending | Pending | Polish quote review step |
| **TASK-52** | Payment/confirmation | `src/components/ParcelBookingScreen.tsx`, `src/components/OrderConfirmationScreen.tsx`, `src/components/CustomerApp.tsx` | Payment trigger and shared order confirmation | Online, wallet and eligible COD choice; method-aware action label; order reference and tracking action | In Progress | Pending | Payment choice maps to existing online/wallet/COD handlers; COD and wallet limits are shown before submit | Confirmation reuses verified payment/COD result and track navigation; visual QA remains pending |
| **TASK-53** | Parcel tracking | `src/components/OrderTrackingScreen.tsx`, `src/components/BookingTimeline.tsx`, `src/design-system/parcelTracking.ts` | Multi-step timeline and recorded handover events | Sender pickup code, verified custody events, fresh partner position, recipient delivery code | In Progress | Pending | Server-recorded pickup/recipient code proofs appear in handover history; stale GPS remains hidden | Responsive visual QA remains pending |
| **TASK-54** | Handover verification | `src/components/ParcelOrderDetails.tsx`, `src/components/ParcelHandoverCode.tsx` | Secure handover card | Pickup and recipient codes concealed until revealed; recorded code-proof history | In Progress | Pending | Backend records code verification only; this flow does not collect signatures or photos | Responsive visual QA remains pending |
| **TASK-55** | Parcel support | `src/components/ParcelOrderDetails.tsx`, `src/components/SupportCasePanel.tsx`, `functions/support.js` | Parcel-linked support case | Order-prefilled support form, damaged/delayed/wrong-location reasons, case replies and history | In Progress | Pending | Wrong-location category is accepted by server; replies refresh from case revisions; response time is operator-configured | Responsive visual QA remains pending |

---

## Phase 6 — Transport & Rides (Tasks 56 – 68)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-56** | Bike transport entry | `src/components/ServiceBookingScreen.tsx` (`ride`) | Pickup-first route form with recent rides | Places-backed pickup/drop selection; saved pickup prefill; completed ride shortcuts; quote blocked until both locations are selected | In Progress | Pending | Route entry and both-location guard covered by regression test | Responsive visual QA remains pending |
| **TASK-57** | Vehicle selection | `src/design-system/RideOptions.tsx`, `src/components/ServiceBookingScreen.tsx` | Bike / Auto / Car vehicle options | Shared accessible cards with selection state and descriptive labels; fare and route estimate from selected server quote | In Progress | Pending | All three options render; estimates remain tied to the selected server quote | Responsive visual QA remains pending |
| **TASK-58** | Pickup and drop | `src/components/ServiceBookingScreen.tsx` | Places-backed route inputs | Dashed connection line, enabled swap after both locations are selected, recent rides | In Progress | Pending | Swapping preserves each selected address and place ID; swap disabled until both are verified | Responsive visual QA remains pending |
| **TASK-59** | Vehicle information | `src/components/TransportBookingScreen.tsx`, `src/design-system/VehicleClassPicker.tsx` | Motorbike/car specs | Only server-supported vehicle classes; required registration, make/model, weight, dimensions and ownership authorization | In Progress | Pending | UI and backend accepted classes agree; carrier fit remains server-checked | Responsive visual QA remains pending |
| **TASK-60** | Carrier/equipment selection | `src/components/TransportBookingScreen.tsx`, `functions/transportPolicy.js` | Server-assigned carrier match | Review explains approved equipment matching; no customer carrier/lift selection or insurance add-on is represented | In Progress | Pending | Copy matches server-side carrier assignment and declared capability limits | Responsive visual QA remains pending; insurance terms need operator confirmation |
| **TASK-61** | Quote | `src/components/ServiceBookingScreen.tsx`, `src/components/TransportBookingScreen.tsx` | Server quote cards with expiry meter | Live expiry progress, server route estimate, price; disclose absent toll/tax itemization | In Progress | Pending | Server expiry remains authoritative; no unreturned toll/tax fields are invented | Responsive visual QA remains pending |
| **TASK-62** | Booking review | `src/components/TransportBookingScreen.tsx` | Route, vehicle, consent and quote review | Route/spec summary; visible-damage and carrier-verification checklist; server price/expiry before payment | In Progress | Pending | Required owner authorization and fresh quote remain enforced | Responsive visual QA remains pending |
| **TASK-63** | Tracking | `src/components/OrderTrackingScreen.tsx` | Fresh carrier location, transport status and chat | Distinguish vehicle being moved from carrier; use reported fresh GPS; expose chat; disclose missing carrier vehicle photo/details | In Progress | Pending | Location appears only from live assigned-driver reports; no simulated GPS or phone action | Responsive visual QA remains pending |
| **TASK-64** | Delivery acceptance | `src/components/TransportOrderDetails.tsx`, `src/components/HandoverCode.tsx` | Concealed pickup and recipient codes; recorded event history | Code reveal only when requested; receiver code guidance; clear evidence-collection limits | In Progress | Pending | Backend-verified code proofs shown in timeline; no receiver photos/signatures are collected | Responsive visual QA remains pending |
| **TASK-65** | Disputes and support | `src/components/TransportOrderDetails.tsx`, `src/components/SupportCasePanel.tsx`, `functions/support.js` | Transport-linked support case | Damage/condition and route-deviation categories; case replies and history; no unsupported instant-call promise | In Progress | Pending | Case is order-linked and accepted by support backend; response targets operator-configured | Responsive visual QA remains pending |
| **TASK-66** | Furniture/movers booking | `src/components/PlannedMoversScreen.tsx`, `src/features/discovery/ServiceDirectory.tsx`, `src/components/CustomerApp.tsx` | Planned-service information screen | Reachable from Movers tile; non-bookable requirement preview; support availability request | In Progress | Pending | Booking/quote inputs stay disabled until a real movers service exists | Responsive visual QA remains pending |
| **TASK-67** | Ride booking | `src/components/ServiceBookingScreen.tsx` | Ride quote and confirmation | Uber-style live driver search animation, driver matched card | Pending | Pending | Pending | Polish ride booking flow |
| **TASK-68** | Personal driver booking | `src/components/ServiceBookingScreen.tsx` (`takeover`) | Hourly driver hiring form | Transmission type (manual/auto), duration chips (2h, 4h, 8h, full-day) | Pending | Pending | Pending | Polish personal driver flow |

---

## Phase 7 — Customer Activity (Tasks 69 – 76)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-69** | Active orders | `src/components/CustomerApp.tsx` (`currentTab === 'orders'`) | Active booking cards across services | Service badge, live status chip, progress mini-bar, 1-tap track button | Pending | Pending | Pending | Polish active orders list |
| **TASK-70** | Order history | `src/components/CustomerPages.tsx` (`history`) | List of past completed/cancelled bookings | Filter by service, formatted date, total amount, reorder CTA, invoice CTA | Pending | Pending | Pending | Polish order history list |
| **TASK-71** | Unified tracking | `src/components/OrderTrackingScreen.tsx`, `src/components/BundleTrackingScreen.tsx` | Multi-service tracker | Consistent status badge, driver avatar, contact buttons, live step timeline | Pending | Pending | Pending | Polish unified tracking view |
| **TASK-72** | Cancellation | `src/components/CustomerApp.tsx` (`handleCancelBooking`) | Confirm dialog | Cancellation reason picker, fee policy disclosure, instant refund notice | Pending | Pending | Pending | Polish cancellation workflow |
| **TASK-73** | Refund status | `src/components/CustomerPages.tsx` (`refund-status`) | Refund status list | Refund amount, reference ID, payment method destination, timeline | Pending | Pending | Pending | Polish refund status screen |
| **TASK-74** | Receipts | `src/components/CustomerPages.tsx` (`receipts`) | Itemized receipts | Professional receipt card, breakdown, tax breakdown, print/share | Pending | Pending | Pending | Polish receipts view |
| **TASK-75** | Chat/support | `src/components/SupportCasePanel.tsx`, `src/features/tracking/BundleLegChat.tsx` | Live chat & support tickets | Message bubbles, timestamp, driver/agent identity, photo upload | Pending | Pending | Pending | Polish customer chat view |
| **TASK-76** | Payment recovery | `src/components/PaymentRecoveryPanel.tsx` | Recovery interface for failed payments | Clear error reason, retry payment button, alternative method options | Pending | Pending | Pending | Polish payment recovery UI |

---

## Phase 8 — Account & Settings (Tasks 77 – 90)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-77** | Profile | `src/components/ProfileScreen.tsx`, `src/components/CustomerApp.tsx` | Profile header and navigation links | Avatar with edit badge, membership status, quick wallet balance pill, grouped links | Pending | Pending | Pending | Polish profile dashboard |
| **TASK-78** | Personal details | `src/components/CustomerPages.tsx` (`edit-profile`) | Editable name, email, phone | Floating labels, validation, email verification status badge, save feedback | Pending | Pending | Pending | Polish edit profile screen |
| **TASK-79** | Saved addresses | `src/components/CustomerPages.tsx` (`addresses`), `src/components/AddressSheet.tsx` | Address cards with delete | Category icons (Home, Work, Other), edit action, set default pill | Pending | Pending | Pending | Polish saved addresses management |
| **TASK-80** | Favourites | `src/components/CustomerPages.tsx` (`favorites`) | Saved restaurants & stores | Tabbed view (Restaurants / Groceries / Dishes), quick order CTA, empty state | Pending | Pending | Pending | Polish favorites screen |
| **TASK-81** | Offers and coupons | `src/components/OffersScreen.tsx`, `src/components/CustomerApp.tsx` | Coupon list with copy/apply | Perforated ticket styling, discount amount, expiry date, terms modal, copy code | Pending | Pending | Pending | Polish offers screen |
| **TASK-82** | Wallet | `src/components/WalletPanel.tsx`, `src/components/CustomerApp.tsx` | Balance and transaction list | Card-style balance overview, quick top-up chips, categorized transactions | Pending | Pending | Pending | Polish wallet UI |
| **TASK-83** | Payment history | `src/components/CustomerPages.tsx` (`payment-methods`) | Saved cards & methods | Brand icons (UPI, Cards, NetBanking), default badge, remove method | Pending | Pending | Pending | Polish payment methods screen |
| **TASK-84** | Settings | `src/components/CustomerApp.tsx` (`settings`) | App settings toggles | Notification preferences, language selector, dark mode toggle, app version | Pending | Pending | Pending | Polish settings screen |
| **TASK-85** | Help centre | `src/components/CustomerPages.tsx` (`help`) | FAQ accordion & contact options | Search FAQs, issue categories, 24/7 chat support button, call helpline | Pending | Pending | Pending | Polish help centre |
| **TASK-86** | Safety centre | `src/components/CustomerPages.tsx` (`safety`) | Safety guidelines & emergency SOS | Emergency contacts setup, SOS button, ride share tracking, safety badges | Pending | Pending | Pending | Polish safety centre |
| **TASK-87** | Privacy and policies | `src/components/CustomerPages.tsx` (`privacy`, `terms`) | Legal text views | Clean typography, table of contents, last updated date | Pending | Pending | Pending | Polish privacy & terms view |
| **TASK-88** | Security | `src/components/CustomerPages.tsx` (`security`) | Password change & session list | Biometric toggle, active sessions, change password modal | Pending | Pending | Pending | Polish security screen |
| **TASK-89** | Account deletion | `src/components/DeletionRequests.tsx` | Account deletion confirmation | Warning notice, reason selection, grace period disclosure, confirmation | Pending | Pending | Pending | Polish deletion requests flow |
| **TASK-90** | Additional account screens | `src/components/AccountDataExport.tsx`, `src/components/PartnerApplicationPanel.tsx`, `src/components/TripBundleScreen.tsx` | Data export & partner links | Clean data export progress, multi-step partner application modal | Pending | Pending | Pending | Polish remaining account tools |

---

## Phase 9 — Driver (Tasks 91 – 103)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-91** | Driver onboarding | `src/components/DriverApp.tsx` (registration) | Vehicle & license inputs | Multi-step document upload, vehicle selection, background check status | Pending | Pending | Pending | Polish driver registration |
| **TASK-92** | Driver home | `src/components/DriverApp.tsx` | Driver metrics & status toggle | Uber Driver-style: online status pill, today's earnings card, trip count | Pending | Pending | Pending | Polish driver home dashboard |
| **TASK-93** | Availability | `src/components/DriverApp.tsx` | Go online/offline switch | Prominent haptic-style online slider/toggle, GPS indicator, battery status | Pending | Pending | Pending | Polish online status toggle |
| **TASK-94** | Job offers | `src/components/DriverApp.tsx` | Incoming order card with countdown | Audible alert visual, pickup distance, fare estimate, countdown timer bar | Pending | Pending | Pending | Polish job offer card |
| **TASK-95** | Accept/reject | `src/components/DriverApp.tsx` | Accept / reject buttons | Large touch targets (min 56px), swipe to accept gesture alternative | Pending | Pending | Pending | Refine accept/reject controls |
| **TASK-96** | Active jobs | `src/components/DriverApp.tsx` | Active job details card | Customer name, route directions, call customer, step action button | Pending | Pending | Pending | Polish active job screen |
| **TASK-97** | Pickup workflow | `src/components/DriverApp.tsx` | Arrived at pickup, verify items | Arrived button, checklist of order items, pickup verification code | Pending | Pending | Pending | Polish pickup workflow |
| **TASK-98** | Route/navigation | `src/components/DriverApp.tsx` | Route map preview | Turn-by-turn simulation, open external map (Google Maps) button | Pending | Pending | Pending | Polish route navigation UI |
| **TASK-99** | Delivery verification | `src/components/DriverApp.tsx` | Customer OTP entry | 4-digit PIN pad, recipient verification, delivery photo fallback | Pending | Pending | Pending | Polish delivery OTP entry |
| **TASK-100** | Earnings | `src/components/DriverApp.tsx`, `src/components/DriverEarningEstimate.tsx` | Recharts weekly earnings chart | Daily/weekly breakdown, incentives earned, tips received, trip breakdown | Pending | Pending | Pending | Polish driver earnings screen |
| **TASK-101** | Payouts | `src/components/PayoutRequests.tsx` | Payout request history | Bank account card, payout request button, processing timeline | Pending | Pending | Pending | Polish payout request panel |
| **TASK-102** | Support | `src/components/DriverApp.tsx` | Support ticket form | Incident reporting, roadside assistance button, priority dispatch call | Pending | Pending | Pending | Polish driver support panel |
| **TASK-103** | Driver profile | `src/components/DriverApp.tsx` | Vehicle & driver info | Rating score, completed trips counter, vehicle inspection date, badges | Pending | Pending | Pending | Polish driver profile |

---

## Phase 10 — Merchant (Tasks 104 – 114)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-104** | Merchant onboarding | `src/components/MerchantBusinessSetup.tsx` | Store details & setup form | Business categories, FSSAI / GST input, store banner upload | Pending | Pending | Pending | Polish merchant setup |
| **TASK-105** | Dashboard | `src/components/MerchantPortal.tsx` | Revenue metrics & active orders | Tablet-optimized layout: live revenue, pending orders badge, online toggle | Pending | Pending | Pending | Polish merchant dashboard |
| **TASK-106** | Incoming orders | `src/components/MerchantPortal.tsx` | Orders queue | Audible new order bell, timer for acceptance, itemized food/grocery list | Pending | Pending | Pending | Polish incoming orders queue |
| **TASK-107** | Preparation | `src/components/MerchantPreparationEditor.tsx`, `src/components/GroceryPickingEditor.tsx` | Order preparation status | Prep time estimator (+5m, +10m), ready for pickup button | Pending | Pending | Pending | Polish order preparation flow |
| **TASK-108** | Catalog | `src/components/MerchantCatalogEditor.tsx` | Menu / product list | Category filters, instant out-of-stock toggle, search bar | Pending | Pending | Pending | Polish catalog manager |
| **TASK-109** | Product editing | `src/components/MerchantCatalogEditor.tsx`, `src/components/ProductExpiryField.tsx` | Item edit form | Name, price, description, variant manager, veg/non-veg, expiry date | Pending | Pending | Pending | Polish product editor modal |
| **TASK-110** | Inventory | `src/components/StockMovementHistory.tsx`, `src/components/MerchantPortal.tsx` | Stock level inputs | Low stock alert badge, bulk stock update, movement history audit | Pending | Pending | Pending | Polish inventory screen |
| **TASK-111** | Store hours | `src/components/MerchantHoursEditor.tsx` | Weekly schedule editor | Day-by-day open/close time pickers, split shifts (lunch/dinner) | Pending | Pending | Pending | Polish store hours editor |
| **TASK-112** | Temporary closures | `src/components/MerchantClosuresEditor.tsx` | Busy / holiday closure manager | Quick pause orders (30 mins, 1 hour, today), custom holiday schedule | Pending | Pending | Pending | Polish closures manager |
| **TASK-113** | Settlement info | `src/components/MerchantPortal.tsx` | Payout balances & ledger | Weekly settlement statement, commission breakdown, download invoice | Pending | Pending | Pending | Polish settlement panel |
| **TASK-114** | Merchant support | `src/components/BookingExceptionPanel.tsx`, `src/components/MerchantRejection.tsx` | Rejection & exception forms | Order cancellation reasons, report driver delay, merchant hotline | Pending | Pending | Pending | Polish exception workflows |

---

## Phase 11 — Operations & Admin (Tasks 115 – 125)

| ID | Task Name | Existing File(s) | Current State | Required Design Changes | Implementation | Visual QA | Functional QA | Next Action |
|---|---|---|---|---|---|---|---|---|
| **TASK-115** | Operations dashboard | `src/components/AdminDashboard.tsx` | KPI cards & bookings monitor | High-density control room: active orders, online drivers, GMV, SLAs | Pending | Pending | Pending | Polish operations dashboard |
| **TASK-116** | Customer support queue | `src/components/SupportOperationsQueue.tsx` | Support tickets queue | Priority badges (Critical, High, Normal), ticket resolution panel, chat history | Pending | Pending | Pending | Polish support queue |
| **TASK-117** | Driver management | `src/components/DriverEligibilityReview.tsx`, `src/components/AdminDashboard.tsx` | Driver KYC review & status | Document preview lightbox, approve/reject with reason, fleet location map | Pending | Pending | Pending | Polish driver management |
| **TASK-118** | Merchant management | `src/components/MerchantBusinessSetup.tsx`, `src/components/PartnerEvidenceReview.tsx` | Partner application audit | Store verification, document review, commission assignment | Pending | Pending | Pending | Polish merchant admin |
| **TASK-119** | Order monitoring | `src/components/AdminDashboard.tsx` | Real-time active orders table | Service filter tabs, SLA breach warning, force reassign driver, cancel | Pending | Pending | Pending | Polish order monitoring table |
| **TASK-120** | Dispatch management | `src/components/DispatchPolicyEditor.tsx` | Dispatch policy configuration | Auto-dispatch radius, driver acceptance timeout, surge multiplier | Pending | Pending | Pending | Polish dispatch policies |
| **TASK-121** | Refund review | `src/components/RefundReviewQueue.tsx` | Refund requests queue | Evidence review, one-click approve/deny, audit log note | Pending | Pending | Pending | Polish refund review queue |
| **TASK-122** | Payout review | `src/components/PayoutRequests.tsx` | Driver & merchant payout queue | Bank account verification, bulk approve, batch export | Pending | Pending | Pending | Polish payout review panel |
| **TASK-123** | Rates and coverage | `src/components/OperationsConsole.tsx`, `src/components/ServiceRateEditor.tsx`, `src/components/RateReviewQueue.tsx` | Pricing matrices by service | Base fare, per-km rate, per-minute rate, minimum fare, service zones | Pending | Pending | Pending | Polish rate configuration |
| **TASK-124** | Account deletion admin | `src/components/DeletionRequests.tsx` | Deletion request queue | Anonymization audit, statutory compliance check, execute deletion | Pending | Pending | Pending | Polish deletion review |
| **TASK-125** | Audit & operational status | `src/components/FinanceJournalPanel.tsx`, `src/components/OrderSynchronization.tsx` | Finance ledger & sync status | Immutable financial entries, balance verification, node sync diagnostics | Pending | Pending | Pending | Polish audit journal |

---

## Verification & Release Criteria

- **Automated Verification:** `npm run lint` (0 TypeScript errors) and `npm run build` must succeed on every task.
- **Visual Verification:** Headless browser automation capturing screenshots at 360px, 390px, and 430px mobile widths.
- **Production Guardrails:** Real business logic, Firestore rules, payment workflows, and auth handling are strictly preserved.
