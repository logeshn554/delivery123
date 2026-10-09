# AllGo page audit and launch requirements

The next service-specific pass added food restaurant/dish detail pages and checkout review, a four-page parcel wizard and private handover details, grocery product/store pages with stock/price browsing, and past-order shopping for food/groceries. See `SERVICE_PAGE_PLAN.md` for the ordered page inventory and validation boundaries.

## Existing pages and flows

| Area | Existing screens |
| --- | --- |
| Access | Welcome, onboarding, email signup and sign-in |
| Discovery | Home, search, food partners, menus and variants, grocery partners and products |
| Delivery services | Rides, parcel delivery, driver hire, vehicle transport, location selection and quote review |
| Checkout | Cart, quantities, address selection, coupon entry and payment flow |
| Orders | Active/history orders, order details, tracking, cancellation and partner chat |
| Account | Profile, preferences, wallet/payment activity, support requests and deletion requests |
| Partner | Driver registration, jobs, earnings/payouts and support; merchant orders and inventory |
| Operations | Order/partner monitoring, driver verification, payout records and deletion processing |

## Dedicated customer pages added

All pages are reachable from Profile. The header bell opens Order updates. Native Android back returns to Profile, and switching pages resets the content scroll position.

| Page | Actual behavior and data |
| --- | --- |
| Personal details | Validates and saves the account name; sign-in email stays read-only |
| Saved addresses | Lists real addresses, selects a default, adds through the existing address form, and removes with confirmation |
| Favourites | Lists this account's device-saved favourites, opens catalogs and removes saved entries |
| Order updates | Shows the latest recorded state of actual orders; device-local read status; no invented notifications |
| Receipts and refunds | Recorded order amounts, items and payment/refund status; identifies summary as distinct from a merchant tax invoice |
| Reviews | Rating/comment submission only for the signed-in customer's completed Neon order; one review per order enforced in SQL |
| Account security | Verifies current password, changes the hash, revokes other sessions and keeps the current session |
| Help centre | Expandable questions for food, groceries, parcels, rides, transport, payments and account data; links to support |
| Safety centre | Pickup, partner identity, payment and parcel safeguards; reporting route; emergency-support limitation |
| Policies and privacy | Links to operator-approved HTTPS privacy, terms and cancellation policies; unavailable states when not supplied |
| Partner applications | Validated delivery/restaurant/grocery/transport application, stored pending; no role assignment or approval claim |
| About AllGo | Services, configured business/coverage/contact information and support route |

New Neon endpoints: `POST /api/account/password`; `GET/POST /api/account/items/reviews`; `GET/POST /api/account/items/partner`. Items remain scoped to the verified session. Password changes are transactional and reviews use a unique database index.

## Operator details still needed

Configure the public variables listed in `.env.example`: business name, support email/phone, service cities, and published HTTPS privacy/terms/cancellation URLs. No business registration, refund promise, emergency hotline, legal policy or support response time has been invented.

Restart the account API after source changes so it adds the review uniqueness index. Restart Vite after environment changes. Rebuild Android to update an installed APK. `powershell -ExecutionPolicy Bypass -File scripts/install-android.ps1` selects an installed Java 21 runtime, rebuilds and installs the APK, forwards port 3004 and launches AllGo. Keep the account API running separately.

## Production launch remains blocked by service integration

Pages are implemented, but source code and a local APK do not establish operational readiness. Current Neon mode covers customer accounts and selected account data. Existing Firebase service functions are not authenticated by a Neon session; production quotes, maps, checkout, refunds, dispatch, tracking/chat, push notifications, driver/merchant/operations permissions and partner application review require a coordinated backend migration or authentication bridge. Existing Firestore catalogs, accounts and orders are not automatically copied into Neon. New catalog and booking tables are empty unless real data is supplied.

Also required: deployed HTTPS API, operator/provider credentials, actual rates and coverage, merchant catalogs, signed Android release, approved policies, role provisioning, backup/monitoring and end-to-end device acceptance. USB localhost is a development connection. Debug-only HTTP allowances are not a production API configuration.

The prior live database test approval was declined. Live password/review/application behavior has not been accepted against Neon or a phone. Type checks, builds and syntax checks provide source-level validation only.
