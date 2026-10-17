# Reference to AllGo feature gap matrix

2026-10-16. Reference behavior is observed only where explicitly stated. Out-of-coverage home and location selector are captured; other behaviors remain requested inspection targets. Existing AllGo sources provide implementation candidates, not proof of complete workflows.

| Reference behavior / requested target | AllGo source | Gap | Required change | Priority | Verification |
|---|---|---|---|---|---|
| Authentication (login activity reached; controls unobserved) | AuthScreen, PhoneAccountFlow, App | Provider/native identity acceptance missing | Test linked registration/sign-in/logout/recovery | P0 | Provider test identities and revocation |
| Coverage-empty home and location selector (observed); search/navigation (unobserved) | CustomerApp, AddressSheet, GlobalCatalogSearch, BottomNavigation | Explicit coverage feedback and location controls need connected-device acceptance | Existing design system/device review | P1 | 360/390/430 widths, unsupported address, denied location, no network |
| Restaurant/menu/customization (unobserved) | RestaurantMenu, CatalogDetails | Real catalog and merchant journey acceptance | Fixture-backed backend integration then staging | P1 | Price/options/availability and cart validation |
| Cart/coupon/checkout/payment (unobserved) | CheckoutReviewScreen, payments.ts, cartPolicy, index.js | Provider callbacks/recovery acceptance | Signed test provider flow, no duplicate booking | P0 | Failure/cancel/replay/out-of-stock cases |
| Confirmation/tracking/cancellation/refund/review (unobserved) | OrderTrackingScreen, CancellationDialog, RefundStatusCard, CustomerPages | Live fulfillment/payment reconciliation acceptance | End-to-end participant flow | P1 | Merchant accept → assignment → delivery → review |
| Grocery categories/products/stock/substitution (unobserved) | GroceryCategories, GroceryProductCard, GroceryPickingEditor | Address stock/picking journey evidence | Test independent grocery workflow | P1 | Stock race, substitution consent, unavailable merchant |
| Profile/address/orders/reorder/help/settings (unobserved) | CustomerPages, AddressSheet, ShopAgainScreen, SupportCasePanel | Authenticated device journeys incomplete | Validate ownership, persistence, offline/retry | P1 | Own account only; no fabricated data |
| No reference assumption: operations | App, AdminDashboard | Admin receives customer-scoped booking feed | FIX-01 tested role-scope subscription | P1 | Admin claim and role tests, scope cleanup |
| No reference assumption: merchant/driver | MerchantPortal, DriverApp; sibling apps | Packaged role paths/shared backend acceptance | Reconcile original separate app strategy | P1 | Actual order and assignment journey |
| No reference assumption: parcel | ParcelBookingScreen, parcelPolicy, ParcelOrderDetails, DriverApp | Recipient-code custody is implemented; photo proof is absent, and returns/claims remain open | Add booking-bound private photo evidence only with published delivery policy, sender and recipient consent, access and deletion lifecycle; preserve independent parcel workflow | P1 | Private upload/scan, customer receipt, retention/deletion, cancellation and claims in emulator/staging |
| No reference assumption: rides/hire | ServiceBookingScreen, bookingPolicy, takeoverPolicy | Dispatch/live trip/provider acceptance | Independent trip state/quote verification | P1 | No driver, stale GPS, trip lifecycle |
| No reference assumption: vehicle transportation | TransportBookingScreen, transportPolicy | Inspection/custody evidence and claims missing | Authorized evidence lifecycle | P1 | Booking to delivery/claim ownership |

Preserve original indigo AllGo tokens and existing Stitch direction. Do not copy proprietary reference assets. Detailed existing screen and state inventory remains in ../audit/2026-10-13/journey-acceptance.md.
