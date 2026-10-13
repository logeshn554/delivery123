# Stitch implementation map

Reference source: user-supplied `stitch_on_demand_delivery_app_ui.zip`, with each `screen.png` paired with its `code.html`. The reference is design guidance; sample people, prices, offers, and vendors are not application data.

| Screen | Production component | Status | Next action |
| --- | --- | --- | --- |
| `1._splash_screen` | `src/components/AuthScreen.tsx` (`welcome`) | Source corrected to reference; automated checks passed; rendered screenshot unavailable | Capture at 320, 360, 390, and 430 px on a working browser/device and compare with reference |
| `2._login_sign_up` | `src/components/AuthScreen.tsx` (`signin`, `phone`) | Avatar, heading, spacing and primary action corrected; lint, build and Stitch UI test passed; screenshot unavailable | Capture rendered views and verify configured sign-in providers. Email remains the default where phone authentication is unavailable |
| `3._location_setup` | `src/components/AddressSheet.tsx`, `src/components/LocationPicker.tsx` | Saved-location list aligned with reference; real account addresses retained; no verified live map | Check permission, selection, lookup, and map feasibility on device |
| `edit_address` | `src/components/AddressSheet.tsx`, `src/data/firestoreHelper.ts` | Reference inspected; existing form adds and defaults addresses but no edit API exists | Keep edit-only controls out of production until an authorized update API exists; verify add/select/delete on test account |
| `food_restaurant_menu` | `src/components/RestaurantMenu.tsx`, `src/components/CustomerApp.tsx` | Stitch menu mounted in production with live catalog, filter, variant, favorite and cart handlers; duplicate menu markup removed | Render with live menu at 320/360/390/430 px and test cart controls |
| `10._grocery_home`, `11._grocery_products` | `src/components/CustomerApp.tsx`, `src/design-system/GroceryProductCard.tsx` | Home heading aligned; production product grid now uses the shared Stitch card; live store and stock data retained | Verify catalog and two-column cards at target widths; category art depends on published categories |
| `13._ride_booking` | `src/components/ServiceBookingScreen.tsx`, `src/design-system/RideOptions.tsx` | Production ride uses the Stitch selection rows, heading and violet action; server quote flow retained | Verify route lookup, quote expiry and payment with test data |
| `14._bike_transport` | `src/components/TransportBookingScreen.tsx` | Reference inspected; generic bike/car vehicle transport retains its three-step verified quote flow | Show bike art only in bike context after visual QA; test transport quote on device |
| `17._packers_movers` | `src/components/PlannedMoversScreen.tsx` | Reference inspected; planned-service form remains disabled because quote and booking are unavailable | Keep support entry; implement only when service backend is authorized |
| `20._offers_coupons` | `src/components/OffersScreen.tsx`, `src/components/CustomerApp.tsx` | Existing Stitch component connected to production Offers tab and cart code entry; no sample discounts | Test coupon eligibility and cart review with real offer data |
| `21._profile` | `src/components/ProfileScreen.tsx`, `src/components/CustomerApp.tsx` | Existing Stitch component connected to production account routes and actual identity fields | Verify each action with a signed-in test account |

PR #4 (`6b8f09c`) cleanup was integrated locally before this welcome change. Driver, merchant, and other customer screens have no matching image in the supplied archive; the existing app and shared design tokens remain their source of truth.
