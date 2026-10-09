# Service-by-service page plan

Work order: food delivery, parcel delivery, then daily-essential groceries. The source pages below are connected to AllGo's existing navigation. They are app screens rather than separate hosted websites.

## 1. Food delivery

| Order | Page | Result |
| --- | --- | --- |
| 1 | Food discovery | Existing search, vegetarian and favourite filters; added name/published-rating sorting and past-order entry |
| 2 | Restaurant menu | Existing live categories and item list; added restaurant information and dish-details links |
| 3 | Restaurant information | Added description, published hours, address, published estimate/rating and accepting-orders state |
| 4 | Dish details and customisation | Added image, partner-provided ingredients/allergens/serving information, valid variants and quantity selection |
| 5 | Cart | Existing editable lines; added quantity cap, variant-price snapshot, closed-partner protection and persisted account-scoped instructions |
| 6 | Delivery/payment review | Added separate review of address, partner, instructions, live item subtotal, verified offer and payment choice before checkout |
| 7 | Confirmation and tracking | Existing verified-payment order confirmation, status/details, tracking and support retained |
| 8 | Receipts and reviews | Previously added account pages retained |
| 9 | Order again | Added completed-order browsing that opens the current partner catalog; does not reuse old prices or automatically charge |

Back from a dish returns to the menu; back from a menu returns to restaurants. Product quantities are capped at 30 per cart line, matching the server's validation. New orders remain subject to server price and availability checks.

## 2. Parcel delivery

| Order | Page | Result |
| --- | --- | --- |
| 1 | Pickup and drop | Dedicated wizard page with local/intercity mode and provider-confirmed addresses |
| 2 | Package information | Contents, category, weight, declared value and fragile flag; no insurance promise |
| 3 | Sender and recipient | Names, country-code phones and handover instructions |
| 4 | Review and quote | Full summary, shipping-requirements confirmation, real route/fare response, quote expiry and confirmed-payment action |
| 5 | Assigned delivery/order details | Package details and private handover contacts for customer and assigned-driver views |
| 6 | Tracking, payment and support | Existing order flow retained |

The dedicated parcel wizard replaces the parcel branch of the general booking form. Route, package and contact values survive moving back between wizard steps. Editing a value invalidates a quote. Backend validation checks sender/recipient fields and consent; the shipping price still comes from the operator's configured route/rate service.

For Firebase settlement, contact numbers are separated from public offered-job data and stored in `booking_contacts/<bookingId>`. Rules permit single-document reads for the owning customer, assigned driver and operations; no list or client write permission is added. Contact records are removed by customer account erasure. These functions and rules must be deployed together before accepting new parcel bookings. Live rules acceptance is outstanding.

## 3. Daily essentials / Instamart-style groceries

| Order | Page | Result |
| --- | --- | --- |
| 1 | Grocery store selection | Existing partners; added store information entry and category reset on store change |
| 2 | Categories/search | Existing catalog categories and saved filters; added in-stock toggle and name/price sorting |
| 3 | Product details | Added pack size, stock, optional brand/ingredients/allergens/storage/origin information and quantity selection |
| 4 | Store information | Added provider-published information and acceptance state |
| 5 | Cart and delivery review | Shared checkout review with food; stock-aware quantity limits and final availability check |
| 6 | Orders/tracking/receipts/support | Existing confirmed-order flows retained |
| 7 | Buy again | Added browsing from completed orders to the current store catalog |

No ten-minute delivery promise, invented stock, unsupported substitution, fake discount or unverified fee is introduced. Published partner/product metadata is displayed only when supplied.

## Catalog fields

Existing required catalog fields remain unchanged. Optional restaurant/store fields: `description`, `openingHours`, `acceptingOrders`. Optional menu fields: `ingredients`, `allergens` (string array), `servingSize`. Optional grocery fields: `description`, `brand`, `ingredients`, `allergens`, `storageInstructions`, `countryOfOrigin`.

In Neon, menu/product parent references come from `allgo_catalog.parent_id`; the API returns canonical `restaurantId`/`storeId` rather than trusting the JSON document's parent field. Real partner and item records must be supplied by the operator.

## Validation and production acceptance

TypeScript, backend syntax, web build and Android asset sync validate source and packaging. Six local backend tests cover coverage/rates, parcel input validation and separation of private contacts from offered-job details. The tests do not verify deployed Firebase rules, payment providers, live maps, Neon delivery operations or a connected phone.

The current Neon account API still does not implement routing/search, price quotes, payment fulfillment, refunds, dispatch, tracking/chat, or privileged driver/merchant operations. Existing Firebase functions require Firebase authentication and configured provider secrets. A coordinated backend migration or authentication bridge is required for those service operations; page creation does not resolve that dependency. No external deployment or database test was performed in this page pass.

Rides, driver hire and vehicle transport retain their existing location, options, quote and payment screens. Their further service-specific work should follow the same discovery → details → review → verified confirmation → tracking/support sequence once backend integration is settled.
