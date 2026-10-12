# Customer journey review — October 10, 2026

Scope: current working tree after commit 731e9af, including uncommitted fixes. Source review only; no new device, provider or browser acceptance was performed for this review. The supplied customer audit is preserved in customer-source-2026-10-10.txt. The full feature inventory remains in follow-up-2026-10-10.md and remediation-register.md.

## Remediation progress after this review

- Cart amount is now labeled item subtotal after discount, with explicit excluded fees and a direction to the complete quote before authorization.
- Header resolves the label of the selected saved address instead of always displaying Home.
- A confirmed order missing from the listener has an explicit loading/retry/payment-activity screen. It performs up to eight authorized document reads and can render the returned order while the main listener catches up. Confirmation no longer claims the order already appears in the list.
- Main delivery address flow exposes the existing manual address search/device-location picker. House/flat, landmark and instructions save as structured metadata through both backends with bounded fields; legacy records still work. These details are also retained in the delivery text used by the current booking flow.
- Coordinate/place-ID persistence and authoritative pin-based quoting remain pending. GPS lookup and geocoding depend on configured Maps and authenticated service access. These edits do not establish physical-device or live account-server acceptance.
- Global catalog search, saved-item resolution, verification link usability, later-stage cancellation and the remaining financial/fulfillment/support requirements below are still open.

## Corrections to the supplied findings

- Wallet selection is present: CustomerApp.tsx exposes a checkbox wired to setUseWallet for cart and service booking flows. The claim that no control calls setUseWallet is incorrect for this working tree. Its backend branch exists; real funding, spending and interrupted-payment acceptance remain required.
- Driver earnings display, address deletion confirmation and offer expiry were fixed in the working tree after the audited commit. They require deployment/device acceptance; they should not be reported as unchanged source defects.
- CheckoutReviewScreen already requires a server price breakdown and shows delivery, packaging, platform fee, tax, discount and total before authorization. The defect is the earlier cart label and explanation, rather than absence of a final quote review.
- ShopAgainScreen explicitly says it opens the current catalog. It does not promise to reconstruct a cart on its own screen. The parent “Order again” wording creates an expectation that is not fulfilled by that implementation.
- Payment recovery and deletion coordination exist. The missing work is completing their remaining failure paths and verifying real integrations, rather than implementing them from zero.

## Confirmed source gaps, ordered by customer impact

| Priority | Journey | Evidence and customer consequence | Required outcome |
|---|---|---|---|
| P0 | Payment to fulfillment | No complete accepted timeout/reassignment/refund journey is evidenced in the current implementation. A paid booking can wait without a defined service resolution. | Publish and implement an assignment deadline, customer-visible exception state, retry/rebook/cancel choice, finance-safe refund and operator escalation. |
| P1 | Wallet funding reliability | createWalletTopup creates the provider order before saving its payment attempt, unlike the durable booking-intent flow. A failure between those actions leaves recovery incomplete. | Durable idempotent funding intent and provider receipt reconciliation; prove replay and crash safety. |
| P1 | Address selection | App.tsx passes detectedAddress undefined. The main address modal saves a label and a free-text address; no GPS picker or separate house/landmark/map-pin fields are rendered there. | Reuse validated location selection, preserve structured delivery details across both backends, and handle denied GPS/manual selection. |
| P1 | Price expectation | Cart labels items minus discount “Amount to pay” while its own explanation calls this the item subtotal. Checkout review adds other charges. | Label subtotal accurately; clearly state that the server quote confirms the total before authorization. |
| P1 | Catalog discovery | Global matchingDishes searches the selected menuItemsList. No matchingProducts result group is rendered. | Authorized cross-merchant product/dish search with availability, coverage, pagination and correct merchant navigation. |
| P1 | Cancellation after acceptance | Ordinary customer cancellation remains limited to pending paid bookings; later stages lack a complete customer request and fee-review flow. | Service-specific cancellation request, reviewed contractual fee, recoverable refund status and operator response. Do not merely widen the allowed state list. |
| P1 | Support | Tickets expose subject/message/open or resolved status. Rules permit admin updates/deletes; there is no complete immutable response/assignment/escalation history. | Order-linked cases with scoped threads, assigned operator, audited status transitions, attachments, escalation and finance-linked outcomes. |
| P1 | Authentication usability | VerifyAccount requires a 64-character hexadecimal token, and server verification uses a long opaque token. | Secure clickable verification/recovery links or a separately designed rate-limited short-code flow; preserve expiry and single use. |
| P1 | Receipt and accounting | Customer receipt is an order summary. Balanced journals exist but final tax/commission/merchant/bank allocation is incomplete. | Business-approved invoice numbering and tax treatment, downloadable artifact, refunds/credit notes and reconciled settlement. Never label a fabricated summary a tax invoice. |
| P2 | Address heading | Header uses literal Home independently of the selected saved address. | Show the selected address label, with a sensible fallback for an unsaved address. |
| P2 | Saved items | Favorites receive the currently loaded menu/product arrays. Finding a saved item can depend on having already opened its merchant. | Store or resolve canonical merchant/item identifiers and load the item's current catalog before navigation. |
| P2 | Payment confirmation | Confirmation navigates to the returned booking ID while details depend on the bookings listener. | Explicit synchronization state, bounded retry and payment activity recovery; never present missing listener data as failed payment. |
| P2 | Repeat purchase | ShopAgainScreen invokes catalog browsing, not a validated reorder operation. | Either name the action Browse again consistently or rebuild available lines with price/variant/stock change review before payment. |
| P2 | Phone changes | Profile shows a phone number without a complete verified replacement flow. | Reauthenticate, verify the new number, reconcile identity ownership and retain booking history. |
| P2 | Tracking | OrderTrackingScreen embeds one driver marker and separately displays ETA. | Verified route and endpoints, stale/future-location rejection, delay/exception states and accessible text equivalent. |

## Service acceptance boundaries

| Service | Existing foundation | Still required for a trustworthy customer journey |
|---|---|---|
| Food | Menus, variants, server quote, merchant preparation stages, driver completion | Merchant acceptance/refusal and refund, preparation ETA/delay, handover proof, quality/missing-item cases, verified coverage and settlements |
| Grocery | Products, stock reservation, server quote and picking-related stage names | Actual picking/packing, substitutes with customer approval, weighted totals, partial fulfillment/refunds, slots, expiry and item returns |
| Parcel | Booking wizard, dimensions/weight, private contacts, pickup/recipient codes | Reserved pickup, manifests/scans/multi-leg custody, private photos/signatures, failed delivery/reattempt/return and damage claims |
| Ride | Bike/auto/car quote and start code | Passenger/luggage capacity, actual vehicle match, no-show/cancellation policy, approved fare changes, safety escalation and disputes |
| Personal driver | Duration choices and start/completion controls | Vehicle/license suitability, authorization/condition evidence, key custody, overtime/extension consent and accident/return acceptance |
| Vehicle transport | Payload dimensions, ownership declaration and equipment eligibility | Verified ownership documents, pickup/destination inspection, loading/unloading custody and damage/insurance claims |
| Goods/movers | Domain design document | Full implementation and verified fleet/crew operations; keep unavailable until accepted |

## Implementation order and evidence

1. Fix customer address, truthful pricing, discovery, saved navigation, synchronization and verification usability. Wallet UI already exists; verify it instead of duplicating it.
2. Make every paid booking and funding attempt recoverable, including merchant refusal, no partner, offline partner, cancellation, refund failure and operator escalation.
3. Complete each service's fulfillment and evidence requirements independently.
4. Add a functioning team-side support queue and customer response history.
5. Require real staging provider transactions, signed Android/iOS device journeys, deployed authorization checks, backups/restore, monitoring and approved policies before launch.

Previous automated test results cover selected money and authorization paths; they do not satisfy these customer acceptance boundaries. Missing owner environments, verified partners, business policy decisions and physical devices remain external requirements. No phase or production gate is accepted by this document.
