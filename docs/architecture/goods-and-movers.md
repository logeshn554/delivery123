# Goods transport and movers domain

Status: design complete; implementation and operational acceptance pending. This domain is not advertised as available by the current six-service application.

## Products and quote contract

Use a separate `freight_jobs` aggregate with `product` values `goods_transport` and `moving`. Vehicle classes are operator-defined mini-truck, pickup and larger goods vehicles with published payload, usable volume, dimensions and permit coverage. Moving additionally specifies crew count, packing materials, dismantling, assembly, floors, lift availability, stairs and access restrictions at each stop.

The customer submits a versioned inventory: item category, count, dimensions, actual weight, declared value, fragile designation and restricted-goods declaration. Multi-stop jobs store an ordered stop list with loading/unloading tasks and time windows. Each inventory revision invalidates its prior quote. Routes, coverage, capacity and rates are calculated by the server. Uncertain loads require a survey and explicit reviewed quote rather than a guessed instant price.

Every quote records expiry, inventory revision, route snapshot, carrier class, crew and equipment requirements, customer charge components, tax treatment, cancellation contract, partner compensation contract and insurance/claims terms version. All amounts use integer paise. Toll, waiting and scope changes need separately recorded evidence and customer approval before an additional payment is requested. Unknown tax, insurance or business rates keep the service disabled.

## Lifecycle

| Current state | Allowed next states | Required actor and evidence |
|---|---|---|
| draft | survey_required, quoted, cancelled | Customer inventory; server coverage/capacity validation |
| survey_required | quoted, cancelled | Authorized surveyor report and customer-confirmed inventory revision |
| quoted | payment_pending, expired, cancelled | Customer accepts current quote and terms before expiry |
| payment_pending | funded, payment_failed | Verified provider reconciliation; durable idempotent payment intent |
| funded | carrier_assigned, cancellation_pending, no_carrier | Verified eligible fleet capacity reservation |
| carrier_assigned | at_pickup, reassignment_pending, cancellation_pending | Assigned carrier; fresh location; job-specific equipment and crew |
| at_pickup | loading, scope_change_pending, failed_pickup | Customer and carrier condition/inventory acceptance |
| loading | in_transit, incident_open | Signed custody manifest, loaded counts, condition evidence and vehicle/crew assignment |
| in_transit | unloading, incident_open | Arrival at the current authorized stop; sequential stop validation |
| unloading | in_transit, delivery_review, incident_open | Stop-specific manifest and recipient acceptance; in_transit only if stops remain |
| delivery_review | completed, dispute_open | Final recipient proof, shortage/damage declaration and all stop acknowledgments |
| no_carrier, failed_pickup | reassignment_pending, cancellation_pending | Customer chooses a revised window or refund under the accepted contract |
| reassignment_pending | carrier_assigned, no_carrier | Expiring offer lease and atomic capacity transfer; consent to schedule changes |
| scope_change_pending | at_pickup, cancellation_pending | Customer accepts/rejects new quote; original contract remains until payment reconciles |
| incident_open | return_pending, in_transit, dispute_open | Audited operations decision and recorded custody holder |
| return_pending | returning, dispute_open | Approved destination, return charge/refund contract and custody manifest |
| returning | returned, incident_open | Signed return receipt with condition and item counts |
| cancellation_pending | cancelled | Refund obligations and any approved compensation journaled exactly once |
| dispute_open | completed, returned, cancelled | Documented reviewed resolution and finance adjustments; no silent deletion of evidence |

Terminal states never transition back. Corrections append events or create a new explicitly linked job. Each command validates actor, expected aggregate revision, allowed transition and an idempotency key inside one transaction. State changes and durable outbox entries commit together. Payment/refund completion remains a separate reconciliation state so logistics progress cannot invent a successful payment.

## Fleet and custody

Fleet organizations own carrier profiles, vehicles, crew and payout accounts. Membership and delegated permissions are server-owned; a fleet dispatcher cannot verify their own organization or change customer charges. Eligibility requires current operator verification, relevant permits, vehicle registration, insurance, payload/volume limits, service-zone coverage and specialist capability. Reserve both vehicle and crew against overlapping scheduled jobs transactionally. Offers expire; reassignment releases the previous reservation and preserves the full event history.

Each custody transfer records from/to identities, inventory revision, counted items, timestamp, location accuracy, condition checklist, damage exceptions and private evidence object references. Pickup and destination receipts use separate codes or signatures bound to that stop and manifest. Missing evidence blocks completion. Photo/document access is limited to the participants and authorized dispute reviewers; signed access expires. Upload validation, malware scanning, retention and deletion obligations must be implemented before enabling this product.

## Finance and failure handling

Use the existing durable payment-intent and balanced journal concepts with new freight-specific adapters. Distinguish customer funds, carrier payable, crew/material expenses, platform commission, tax, insurance and bank clearing. Record deposits, final balance, approved scope changes, partial refunds and cancellation compensation independently; never derive carrier pay as an unreviewed percentage of inventory value. Settlement is blocked while custody, disputes or unmatched payment/refund obligations remain unresolved.

An operations queue exposes expired offers, missed windows, no carrier, unpaid scope changes, missing custody evidence, return jobs, incidents, disputes and stuck refunds. Retries have attempt limits and a dead-letter review record. Notifications are an outbox effect; notification failure cannot reverse committed finance or custody events.

## Implementation and acceptance plan

1. Implement pure command/transition, quote, eligibility and compensation policies with schema versions and negative tests.
2. Add aggregates, immutable events, capacity reservations, private media references, outbox and scoped rules/callables. Keep release availability disabled.
3. Add customer inventory/survey/quote acceptance, fleet scheduling, carrier manifests and crew/stop workflows, and operations exception review.
4. Verify concurrent capacity claims, quote edits during payment, duplicate and delayed webhooks, partial refunds, reassignment, stop order, custody mismatch, upload access, incident/return and dispute settlement.
5. Run real staging jobs with a verified fleet, physical vehicles, loading/unloading crews, actual documents and device tracking. Record provider, insurance and policy acceptance before enabling any city.

Open operator decisions: operating cities, actual vehicle classes and permits, verified fleet/crew, payload restrictions, survey charges, contractual rates, taxes, insurance cover, liability limits, cancellation windows, support escalation and evidence retention. These require owner-supplied facts; they are not populated with sample production values.
