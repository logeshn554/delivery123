# Issue fixes and sample acceptance — 14 October 2026

This register follows the device QA report. The earlier `remediation-register.md` remains the inventory for broader architecture, operations and release requirements; none of its pending gates are implicitly closed here.

| Device finding | Work completed | Remaining acceptance |
| --- | --- | --- |
| Android system-bar overlap | Native viewport containment rebuilt and installed; action/header spacing checked on phone | Full keyboard and gesture navigation matrix |
| Misleading service-session recovery | Typed reasons distinguish absent session, disabled environment, verification requirement and disconnected session; booking and support use the same policy | Real provider configuration and live-session recovery |
| Transient profile refresh resets forms | A background profile error now renders a non-destructive notice while keeping the mounted app/form. Successful polling clears the notice. Initial profile failure still blocks startup; expired Neon sessions still sign out | Controlled network fault device test; Firebase role-revocation scenario |
| Cached partner identity | Newly added cart lines persist partner display names. Checkout uses the stored name if catalog lookup fails. Old carts explicitly explain missing identity instead of claiming Selected partner | Real catalog refresh and partner removal acceptance; old missing names cannot be reconstructed |
| Native OTP unavailable | Kept fail-closed configuration feedback | Owner has no Firebase setup. Sample tests cannot supply real SMS credentials or certify OTP |
| Disabled identity bridge | Kept fail-closed; corrected customer recovery advice | Firebase provider setup and trusted server identity credentials |
| Empty catalogs | Honest empty states retained; sample sandbox offers all six service categories | Approved live/staging catalog data |
| Large account chunk warning | Tracked, not treated as a crash | Device startup profiling and measured bundle optimization |

## Sample tests

Owner requested sample testing because provider configuration is unavailable. Built the explicit demo mode separately at `.cache/demo-web`, served locally on port 3010. It is visibly labeled DEMO SANDBOX, uses in-memory simulated data and never calls a payment provider or dispatch service. The phone retains the real development app.

Browser interaction verified sample food payment failure and cancellation retain the cart, food confirmation, grocery confirmation/completion, and ride/parcel/personal-driver/vehicle-transport confirmation/completion. Completion disabled further tracking advancement. Food completion was not separately confirmed. Sandbox behavior tests only the playground; it does not certify corresponding live feature integrations.

The sandbox now includes explicit payment failure and cancellation controls, plus collision-resistant simulated order references. Existing emulator tests exercise actual backend policy with sample records and mocked providers, including ownership, stock/payment concurrency, refunds, role/session revocation, support and partner evidence. All 96 emulator tests passed this run.

Added four service-access policy regression tests. Application suite now contains 112 tests. TypeScript/build/native assembly are rerun for the final artifact. Real OTP/payment/provider acceptance remains pending.

## Coverage retained

All unverified features listed in `2026-10-14-device-qa.md` remain open unless explicitly accepted above. No real payment/order or live catalog publication was made. No credentials were fabricated, no fake OTP was enabled in the real app, and no provider access checks were weakened. Production readiness is not claimed.
