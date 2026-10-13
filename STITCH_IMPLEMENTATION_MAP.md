# Stitch implementation map

Reference source: user-supplied `stitch_on_demand_delivery_app_ui.zip`, with each `screen.png` paired with its `code.html`. The reference is design guidance; sample people, prices, offers, and vendors are not application data.

| Screen | Production component | Status | Next action |
| --- | --- | --- | --- |
| `1._splash_screen` | `src/components/AuthScreen.tsx` (`welcome`) | Source corrected to reference; automated checks passed; rendered screenshot unavailable | Capture at 320, 360, 390, and 430 px on a working browser/device and compare with reference |
| `2._login_sign_up` | `src/components/AuthScreen.tsx` (`signin`, `phone`) | Avatar, heading, spacing and primary action corrected; lint, build and Stitch UI test passed; screenshot unavailable | Capture rendered views and verify configured sign-in providers. Email remains the default where phone authentication is unavailable |
| `3._location_setup` | `src/components/AddressSheet.tsx`, `src/components/LocationPicker.tsx` | Saved-location list aligned with reference; real account addresses retained; no verified live map | Check permission, selection, lookup, and map feasibility on device |
| `edit_address` | `src/components/AddressSheet.tsx`, `src/data/firestoreHelper.ts` | Reference inspected; existing form adds and defaults addresses but no edit API exists | Keep edit-only controls out of production until an authorized update API exists; verify add/select/delete on test account |
| `food_restaurant_menu` | `src/components/RestaurantMenu.tsx` | Existing implementation; fresh comparison pending | Check live menu and variant controls |
| `10._grocery_home`, `11._grocery_products` | `src/components/CustomerApp.tsx`, `src/design-system/GroceryCategories.tsx`, `src/design-system/GroceryProductCard.tsx` | Existing implementation; fresh comparison pending | Check live catalog and stock states |
| `13._ride_booking`, `14._bike_transport`, `17._packers_movers` | `src/components/ServiceBookingScreen.tsx`, `src/components/TransportBookingScreen.tsx`, `src/components/PlannedMoversScreen.tsx` | Existing implementation; fresh comparison pending | Check real quote and planned service states |
| `20._offers_coupons`, `21._profile` | `src/components/OffersScreen.tsx`, `src/components/ProfileScreen.tsx` | Existing implementation; fresh comparison pending | Check cart eligibility and account actions |

PR #4 (`6b8f09c`) cleanup was integrated locally before this welcome change. Driver, merchant, and other customer screens have no matching image in the supplied archive; the existing app and shared design tokens remain their source of truth.
