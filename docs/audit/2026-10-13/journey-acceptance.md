# Screen and journey acceptance register

**A** = existing functional source retained with shared foundation refinements; authenticated runtime acceptance pending. **B** = public screen layout/navigation checked in a real browser using the existing Firebase development provider; provider/network submission and native-device acceptance pending. **U** = deliberately unavailable; backend support must be implemented before enabling. No A/B row means production-complete.

For each A screen, acceptance requires: no clipping at 320/390/430px and enlarged text; usable safe areas/keyboard/scroll; named 44px controls and focus order; correct forward/back navigation; loading/empty/failure/success feedback; real owner-scoped staging data; and an Android/iOS journey check. Each is still unchecked unless the evidence below explicitly establishes it. Component-level inventory and comparison are in `component-comparison.md`; it includes every existing/reference TSX file and explicit state branch.

| Screen | Existing UI / source | ZIP reference / problems | Selected design | Status and acceptance evidence |
|---|---|---|---|---|
| Native splash | Android styles; iOS launch storyboard | Stock Capacitor splash resources | AllGo code-native mark/purple | New code; XML parsed; Android compile; device/iOS visual checks pending |
| Startup / account reconnect | main/App | Auth startup + reconnect | Existing honest account state | Browser startup captured; configured API unavailable; reconnect captured |
| Welcome | AuthScreen | Detailed brand/auth view | Refined existing purple welcome | B; 320px screenshot; corrected horizontal overflow |
| Onboarding: discover / send / travel | AuthScreen, three steps | Auth introduction flow | Existing copy/icons with touch dots | B; all three Next transitions checked; 320px image |
| Sign in | AuthScreen | Larger authentication source | Existing real provider form | B; 320/390/430px; inputs 16px, controls >=44px; no credentials submitted |
| Sign up | AuthScreen | Detailed signup | Existing real signup | B; 320/390px; scroll/focus restoration checked; no account created |
| Password recovery | AuthScreen, AccountActionScreen | Recovery screens | Existing secure recovery | B for recovery form at 320px; link/token path A; no reset submitted |
| Phone / OTP | AuthScreen + nativeAuth | Phone flow | Existing native provider | A; native-only; real provider configuration missing |
| Email verification | VerifyAccount | Small verification component | Existing actual account verification | A |
| Customer home | CustomerApp | New customer composition | Existing real listings + clearer heading | A; promo/discovery retained; unavailable bundle notice remains in Services |
| Services | ServiceDirectory | Eight service tiles | Existing six connected workflows | A; automated navigation retention passes; Goods/Movers remain U |
| Global service/catalog search | CustomerApp + GlobalCatalogSearch | Short catalog search helper | Existing live search + named input | A; backend search retained |
| Location permission/search/picker | LocationPicker | Simplified location picker | Existing verified provider locations | A; must check denial, incomplete match, timeout and stale selection |
| Address selection / add address | CustomerApp modal | EditAddressScreen prefilled sample data | Actual saved values/provider picker | A; no sample address/contact/coordinates adopted |
| Saved addresses | CustomerPages | Address summary/edit | Existing owner-scoped storage | A |
| Food discovery / filters / sort | CustomerApp | Food discovery + default catalog | Existing approved restaurants | A; catalog loading uses shared StatusPanel |
| Restaurant menu / categories | CustomerApp | RestaurantDetailView; fixed category ordering/fallbacks | Existing live categories/menu | A; no proprietary branded fallback or fake menu |
| Food details / customization | CatalogDetails | CatalogDetails + restaurant variants | Existing actual options/availability | A; variant price/cart handlers retained |
| Grocery store selection | CustomerApp | GroceryDeliveryView | Existing approved store list | A; no unsupported delivery-time claim |
| Grocery categories / search / sort | CustomerApp + groceryCatalog | Fixed illustrated category taxonomy | Existing live categories/stock | A; regression filters pass |
| Grocery product details / quantities | CatalogDetails + CustomerApp | Reference grocery controls | Existing product/stock/expiry contracts | A; stock/expiry checks retained |
| Cart / coupon | CustomerApp | Cart + static OffersScreen claims | Existing server coupon/quote | A; no reference fixed promotions adopted |
| Checkout review | CheckoutReviewScreen | Similar review layout | Existing confirmed cost breakdown | A; live quote/payment acceptance pending |
| Payment confirmation / pending recovery | CustomerApp + PaymentRecoveryPanel | Fabricated reference payment IDs | Existing verified payment service | A; no fake confirmation; provider acceptance pending |
| Orders / booking activity | CustomerApp | Order summaries | Existing owned bookings/status | A; real recorded history retained |
| Food/grocery order tracking | OrderTrackingScreen | Simplified tracking + illustrative map | Existing fresh recorded location/status | A; tracking freshness tests pass; GPS/provider journey pending |
| Parcel pickup/drop wizard | ParcelBookingScreen | Short parcel form | Existing verified-address wizard | A |
| Parcel package/weight/dimensions/contact | ParcelBookingScreen | Reduced package controls | Existing actual booking fields | A |
| Parcel quote/review/pay | ParcelBookingScreen + CustomerApp | Simplified price path | Existing server quote/payment | A |
| Parcel history/details/tracking | ParcelOrderDetails + OrderTrackingScreen | Short tracking detail | Existing custody/freshness contracts | A; parcel status-copy tests pass |
| Ride route / vehicle selection | ServiceBookingScreen | General ride source | Existing Bike/Auto/Car options | A; real quote required |
| Ride quote / tracking | ServiceBookingScreen + OrderTrackingScreen | Reference map styling | Existing validated quote and live status | A; quote deadline/malformed tests pass |
| Personal driver hire | ServiceBookingScreen | Driver hire reference | Existing service/vehicle/duration | A |
| Vehicle transport route | TransportBookingScreen | BikeTransportScreen sample route | Existing provider-confirmed route | A |
| Vehicle details/loading/scheduling | TransportBookingScreen | Sample vehicle identity/fixed categories | Existing actual dimensions/weight/date | A |
| Vehicle transport quote/review | TransportBookingScreen | Hard-coded reference fares | Existing server-authorized quote | A |
| Vehicle transport details/tracking | TransportOrderDetails + OrderTrackingScreen | Small transport summary | Existing booking/status | A |
| Reorder / shop again | ShopAgainScreen | Simplified reorder | Existing stock/partner availability checks | A |
| Reviews | CustomerPages | Small review screen | Existing immutable completed-order review | A; emulator authorization checks pass |
| Profile / personal details | CustomerApp + CustomerPages | ProfileScreen supplies sample identity/wallet | Actual account values and actions | A |
| Favorites | CustomerPages + CustomerApp | Saved catalog UI | Existing owned favorites | A |
| Notifications | CustomerPages + nativeNotifications | Order updates | Actual booking-derived updates | A; native permission/push checks pending |
| Wallet / ledger / top-up | WalletPanel + CustomerApp | Short actions/reference defaults | Existing verified balances/payments | A; ledger/provider journey pending |
| Receipts / refunds | CustomerPages | Simplified receipts | Recorded values/refund state | A |
| Settings / preferences / deletion | CustomerApp + CustomerPages | Profile/settings | Existing account operations | A; data/security contracts unchanged |
| Account security / export | CustomerPages + AccountDataExport | Short security surface | Existing secure actions/export | A |
| Support ticket / support chat | SupportCasePanel + CustomerApp | Simplified support component | Existing owned support/chat | A |
| Order/driver chat | CustomerApp + DriverApp | Reference chat | Existing participant-authorized messages | A; emulator authorization passes |
| Help / safety / policies / about | CustomerPages | Small account pages | Actual operator configuration | A; unavailable policy links remain honestly labeled |
| Partner applications / documents | PartnerApplicationPanel + PartnerEvidencePanel | Simplified onboarding | Existing private application/evidence | A; upload scan/review contracts retained |
| Driver profile/verification | DriverApp | Local-only demo driver | Existing verified partner state | A |
| Driver availability/location consent | DriverApp + native location service | Local online toggle | Existing real availability/consent | A; device permission/background acceptance pending |
| Driver incoming requests / accept/reject | DriverApp | Simplified request cards | Existing assigned offer/expiry/dispatch | A |
| Driver pickup / navigation / custody codes | DriverApp | Simplified trip map | Existing directions/status/codes | A |
| Driver completion / delivery confirmation | DriverApp | Simple completion | Existing OTP/state transition | A; standalone photo/signature proof UI is not implemented |
| Driver history / earnings / payout | DriverApp + PayoutRequests | Hard-coded reference earnings/trips/rating | Existing recorded balances + shared navigation | A; source restructured; staging interaction pending |
| Driver support | DriverApp | Simplified driver tabs | Existing support/ticket | A; background is inert while subview open |
| Merchant orders/preparation/picking | MerchantPortal + editors | Reduced merchant view | Existing handlers + light Orders tab | A |
| Merchant catalog / inventory | MerchantPortal + MerchantCatalogEditor | Reduced stock controls | Existing live stock/editor + Catalog tab | A |
| Merchant hours/closures | MerchantHoursEditor + MerchantClosuresEditor | Missing complete controls | Existing forms + Settings tab | A; editors stay mounted; staging persistence pending |
| Merchant business onboarding | PartnerApplicationPanel + MerchantBusinessSetup | Reduced merchant role | Existing assigned-business workflow | A |
| Merchant analytics | MerchantPortal | Simplified summary | Existing recorded revenue/count | A; deeper analytics not newly invented |
| Administrative operations | AdminDashboard + all queue/editor components | Reduced dashboard | Existing desktop operations + readable controls | A; all panels inventoried; role/claim rules retained |
| Combined journey builder | TripBundleScreen | Reference journey presentation | Explicit unavailable builder | U; backend fulfillment acceptance required |
| Existing combined history/status | BundleActivity + BundleTrackingScreen | Very short bundle views | Existing owner history/status | A; no fake GPS or checkout added |
| Goods delivery / movers | ServiceDirectory; no supported movers workflow | Reference timer-generated movers fare | Explicit disabled planned tiles | U; separate real workflow/backend required |

## Browser acceptance completed

- [x] Auth welcome fits 320px without horizontal scrolling after removing the forced minimum page width.
- [x] Onboarding advances through all three states into signup.
- [x] Signup/signin/reset screen changes return to scroll position zero and focus the heading.
- [x] Password visibility toggles and the accessible button name changes correctly.
- [x] Sign-in checked at 320/390/430px; signup at 320/390px; no horizontal overflow in measured layouts.
- [x] Auth inputs are 16px; measured actions are at least 44px; primary/secondary height refinements remain in shared CSS.
- [x] Screenshots captured from actual components, without submitting authentication or financial requests.
- [ ] Browser/device keyboard avoidance, large accessibility font scaling, screen-reader announcement quality and reduced-motion visual acceptance.
- [ ] Real Firebase/Neon signup/signin, native OTP/Apple/Google, staging catalog/checkout, dispatch, tracking, payouts and role journeys.
