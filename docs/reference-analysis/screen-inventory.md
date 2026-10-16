# Reference screen inventory

2026-10-16. Device: emulator-5554 (sdk_gphone16k_x86_64). Installed package: in.swiggy.android. Normal launcher command succeeded; resumed activity: .nux.login.LoginActivityV2. No REA MCP tools exposed this session; no APK extracted.

| Screen | Journey | Observed components | Entry / exit | States | Screenshot | Interaction | Confidence / evidence | AllGo implication |
|---|---|---|---|---|---|---|---|---|
| Login activity, visible contents unresolved | Launch/authentication | None confirmed | Android launcher → LoginActivityV2; exit untested | Initial screenshot black; UI hierarchy null | Local ignored .cache/reference-analysis/swiggy-launch.png | Launcher only | High for activity identity; no confidence in visual layout | Retain own authentication; do not infer reference controls |

Home/location/search/categories/promotions/navigation, restaurant listing/details/menu/customization, cart/coupons/checkout/payment, confirmation/tracking/reviews/support, grocery categories/product grids/details/stock/substitution, profile/addresses/orders/reorder/refunds/notifications/settings are **not yet observed**. No screenshots or behavioral claims are invented for these screens. Record a separate row with all columns when actually reached. Login, payment or capture protections must not be bypassed.

Second capture (.cache/reference-analysis/swiggy-awake.png) visibly showed Google's optional phone-number chooser: rounded bottom sheet, explanatory privacy text, selectable number and close control. Normal Back dismissed it without sharing a number; .cache/reference-analysis/swiggy-login.png still shows a black app surface and system gesture bar. This confirms only the system chooser, not Swiggy login controls. No capture-protection cause is asserted.
