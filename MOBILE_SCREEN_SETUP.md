# AllGo mobile screen setup

## Connected screens

- Welcome and onboarding lead into Firebase email sign-in, account creation and password reset.
- Home opens the food, grocery, parcel, ride, personal driver and vehicle transport flows.
- Food opens live restaurant menus; grocery opens live store products. Cart and checkout use catalog records and server-validated prices.
- Parcel, ride, personal driver and transport collect pickup/destination and service details, request a server quote, then open payment checkout.
- Orders open actual status, delivery code, assigned partner chat and the partner's last reported map coordinates.
- Profile includes saved addresses, preferences/settings, support and account payment activity. Wallet balance is read from the account; balance spending and top-ups are not implemented.
- Driver mode requires an operations-assigned driver role and verified profile. Online drivers accept paid jobs and update pickup/transit/completion through server transactions. Completion requires the recipient code.

Static branding, illustrations and service labels are presentation assets. Catalogs, bookings, quotes, balances, tracking, support and earnings use Firebase records; empty collections show empty states.

Food menu items may define optional paid variants in a `variants` array. Each entry has a stable `id`, customer-facing `label`, positive numeric INR `price`, and optional `available` boolean. When variants exist, a customer must select an available variant; the payment backend reads its price and label from the catalog. Do not send catalog prices as trusted checkout values.

## Required live configuration

Enable Email/Password in Firebase Authentication. See AUTH_SETUP.md for sign-in setup and PAYMENTS.md for Razorpay credentials and deployment.

Populate real restaurants/menu_items and grocery_stores/products through the administrative catalog workflows. Do not seed fictional vendors, orders, locations or reviews.

Cloud Functions require these operator-managed Firestore documents:

| Document | Required configuration |
| --- | --- |
| service_pricing/ride | enabled: true; options.bike.price, options.auto.price, options.car.price |
| service_pricing/parcel | enabled: true; options.Documents.price, options.Box.price, options.Electronics.price, options.Others.price |
| service_pricing/takeover | enabled: true; options.hourly.price, options.halfday.price, options.fullday.price |
| service_pricing/transport | enabled: true; options.bike.price, options.car.price |
| operations/settlement | driverShareBps: integer 0–10000, set to the actual contracted settlement policy |

Prices must be positive numeric INR values. Service pricing also requires operator-owned `zoneIds`; see `MAPS_SETUP.md` for polygons, route modes and optional distance/time/weight rates. Address selections are resolved on the server and checked against coverage. Stored quotes expire after five minutes. Route travel estimates do not promise an assigned partner's arrival time.

Deploy functions and Firestore rules together before using the new driver actions. The callables are getServiceQuote, acceptDriverBooking and advanceDriverBooking alongside the existing payment callables. They run in asia-south1. Direct driver booking writes are prohibited by the updated rules.

## Preview

Keep npm run dev running. For the existing Android development install, run Capacitor live reload with the laptop's current Wi-Fi IP and port 3000. If the address changes, update the command and reinstall/relaunch the development app. Android packaging requires the configured SDK and JDK 21.

## Limits

Successful compilation does not verify a live login, payment, delivery or Android installation. Cloud configuration and deployment have not been performed by this source update. Native Google/Apple/phone sign-in, wallet spending/top-ups, automated refunds, production dispatch and push notifications require further implementation and provider configuration. The reference is a design guide, not evidence those services are enabled.
