# October 11 implementation and activation notes

These changes are source implementations, not live launch acceptance. The complete feature inventory remains in follow-up-2026-10-10.md and the original findings in remediation-register.md.

## Account action links

Set ACCOUNT_PUBLIC_WEB_ORIGIN to the actual public web origin, also present in ACCOUNT_ALLOWED_ORIGINS. Production requires HTTPS and forbids loopback. Configure the verified sender and email API key in the deployment secret system. Serve the SPA for /account-action so direct email links work. The fragment token is held only in memory and removed from browser history; refreshing requires opening the original email link again. Verification requires an explicit confirmation click. No mail delivery acceptance has been performed.

## Catalog search

Deploy indexFoodCatalog, indexGroceryCatalog and searchPublishedCatalog alongside the updated rules and client. The index is server owned; results re-read canonical item and merchant records before returning public fields. Closing a shop, disabling a service, deleting an item or exhausting grocery stock therefore prevents stale results being returned.

For existing catalog documents, use trusted application-default credentials for the chosen environment, then run from the repository root:

```powershell
node functions/backfillCatalogSearch.js --project=ACTUAL_PROJECT_ID --database=ACTUAL_DATABASE_ID
node functions/backfillCatalogSearch.js --project=ACTUAL_PROJECT_ID --database=ACTUAL_DATABASE_ID --apply
```

The first command is a dry run. Replace the placeholders with actual resources. No backfill or cloud deployment has been performed. Prefix search is not geographic ranking; final delivery coverage is checked at checkout.

## Support authority

Create cases through createSupportCase. Only the case owner or a currently authorized administrator can read conversations. Staff claim a case before replying or resolving it; command revisions prevent stale concurrent changes. Resolution records an operational reason and does not itself transfer or refund money. Configure platform_config/support.firstResponseMinutes only after choosing the actual support policy; without it the UI reports that no response target is configured.

Legacy SQL support records remain available in account export. New SQL support creation fails explicitly until the secure service session is connected. A coordinated migration of old tickets, support attachments/scanning, notification acceptance, automatic SLA escalation and granular staff permissions remain unfinished.

## Funding recovery

The client saves a funding request before provider creation. Creation retries reuse the same owner-bound UUID and amount. Uncertain provider responses retain the intent for receipt reconciliation; concurrent calls cannot create multiple orders. The status action retains uncertain, authorized and processing requests. A pending reference is cleared only following server-confirmed payment or full refund. Real Razorpay, refund and bank evidence remain required.

## Booking exception review and refund worker

Deploy reportBookingException, resolveBookingException, listPendingRefunds, reviewPendingRefund and reconcilePendingRefunds with the client update. Booking exception records are part of the participant-readable booking; immutable events use the existing server-only booking event rules. An open exception blocks assignment, merchant/driver progression and driver release. Operations resolution resumes the existing stage and never bypasses pickup/completion codes or creates a payout. Staff must first establish that the problem has actually been resolved. Return custody and claims still need separate domain workflows.

The refund worker checks up to 50 unresolved records every five minutes, rotating an internal document-ID cursor so persistent failures cannot permanently starve later records. It reads provider payment evidence and reconciles cumulative refunded money; it never creates a fresh refund. Canonical provider cancellation records the intent before the refund call. Missing payment identity, mismatched amounts and failed provider requests remain review items. Cloud deployment and real payment acceptance have not been performed.

Merchant rejection now calls rejectMerchantBooking for an unaccepted, unassigned food/grocery order only, verifies the current merchant's business ownership, requires a reason, and uses the same wallet/provider refund workflow. The rejection event is immutable and repeated calls cannot refund twice. Prepared orders, substitutions, post-pickup failures and partial refunds still require their respective domain policies.

## Dispatch timeout recovery

The operations dispatch policy editor records a per-service partner-search threshold, a reason, a version and immutable history. Blank disables escalation for the selected service. Changes are server-authorized, replay-safe and protected against stale overwrites. Deploy getDispatchPolicy, setDispatchPolicy and escalateUnassignedBookings with the client and existing booking status/driver index.

The worker scans up to 100 waiting bookings each minute with a rotating cursor, rechecks payment, stage and assignment in a transaction, then creates a no_partner exception. Active exceptions cannot receive new offers. Operations can cancel through the existing refund workflow or resolve the problem to start a fresh search window. Grocery/food search starts at merchant readiness; legacy ready bookings without a known readiness timestamp need a coordinated migration rather than an invented timestamp. Driver release before pickup resets the search window. Push change detection includes exception revisions; real push acceptance remains open.

Acceptance still requires actual operator thresholds, deployed index/scheduler verification, high-volume queue latency measurement and a real no-supply/reassignment/refund staging journey. This worker does not yet time out an assigned driver's pickup, implement return custody, or perform direct dispatcher assignment.

## Account lifecycle improvements

Deploy the updated exportAccountPage and deletion handler with the account API and client. Support message/event and booking-event exports verify parent ownership before reading children. Driver jobs, driver ledger and payouts are scoped to the authenticated UID. Payment exports allowlist financial fields and omit provider signatures or private implementation data. The UI includes separately authenticated Neon account-store exports for linked users, including legacy support and bookings. SQL booking pagination reads allgo_bookings, not account items; canonical row/document IDs determine export cursors.

Exports are paginated live reads, not a consistent point-in-time snapshot. The UI reports that limitation. A loop or more than 100 pages in one section fails without presenting a partial copy. Many histories can exceed callable rate limits; a scalable server export job and native file-sharing acceptance remain unfinished. A disconnected linked service session also fails the complete-export action explicitly.

Deletion redacts free-text exception, preparation and booking-event data while retaining financial amounts, status stages, revisions and required references. Support cases and their conversations are recursively removed by the existing deletion worker. Tests exercise redaction idempotence and retained evidence, not a live production account deletion. Operator-approved retention, cross-store device/provider acceptance and historical migration remain required.

## Grocery picking

Deploy confirmGroceryPicking and the updated advanceMerchantBooking with the merchant/customer client. Merchants confirm each reserved line's packed quantity during active grocery preparation. Quantity must be an integer between zero and the original ordered quantity. The current merchant business must own the booking; paid, unassigned preparation and no open exception are required. Repeated command references cannot create repeated events, and stale revisions cannot overwrite another staff member's confirmation.

Readiness requires all line identities and quantities to match the immutable reserved order. Existing preparing grocery orders must be physically picked and confirmed through this UI before readiness; already ready or dispatched bookings are preserved. Missing or malformed legacy item lists need operations review. Picking does not reserve more stock, change the order or alter its price. Missing-item substitutions, partial fulfillment/refunds and weighted quantities require further customer-approved financial workflows and are unfinished. Device interaction and the full real grocery staging journey remain unaccepted.

## Merchant closure calendars and catalog authorization

Deploy setMerchantClosures, updateMerchantCatalog, the shared merchant policy, client and rules together. Closure dates use the merchant time zone and cover the entire local day; a closed previous day cannot start an overnight opening period. Invalid calendar dates, more than 90 entries, wrong business ownership and stale revisions are rejected. Existing orders remain active and must be fulfilled or separately reviewed/cancelled. No actual closure dates have been configured by this work.

Restaurant/store and menu/product client writes are now denied even with operations claims. Existing availability/stock helpers use updateMerchantCatalog, which accepts current verified operations staff or the owning merchant, validates values and records an audit event. Catalog editing continues through saveCatalogItem; hours through setMerchantHours. Store creation/onboarding and controlled imports still need complete server workflows. Trusted Admin SDK import/migration tools are unaffected. Deploy the client and server updates before enabling the stricter rules; verify deployed authorization for every role.

Customer-facing closure descriptions, reservations/slots, workload capacity, device interaction and real closed-store checkout/search acceptance remain unfinished.

## Merchant business setup

Deploy createMerchantBusiness, the shared merchant availability policy and the client together. Current verified operations staff can create a closed restaurant/grocery draft with an actual ID, name, address, time zone and setup reason. Replay uses the immutable setup request; existing business IDs cannot be overwritten. Creating a draft grants no account role, claim, ownership or compliance approval. Drafts are excluded from customer discovery and cannot accept checkout through an acceptingOrders flag change.

The existing trusted provisionRole tool can bind a registered account to an actual catalog, after operator review. A complete consented application/document/review/activation workflow remains unfinished. New drafts cannot be activated through the client until that workflow exists; this restriction is explicit in the setup UI. Existing catalogs without onboardingStatus retain their prior behavior and need historical compliance migration and acceptance. Business image, rating and delivery estimate fields on drafts are empty/unrated rather than fabricated operational evidence. No real merchant or store has been created by these development changes.

## Canonical partner applications

Deploy submitPartnerApplication, reviewPartnerApplication, amendPartnerApplication, export/deletion updates, rules and client together. Applicants explicitly consent to private operator review, can track feedback, correct a needs-information application, resubmit or withdraw with an explanation. Operators can request information or reject with a reason. Commands validate ownership/current operations role, application revision and replay references; concurrent submissions cannot create multiple active applications of the same type. Self-declared phone numbers are explicitly unverified. No application action grants a partner role or activates a business.

The customer and admin views page through private application records. New account-store partner submissions are rejected instead of creating a second unmanaged queue; existing SQL partner records remain retained and exportable. Service exports include applications and review history, and deletion recursively removes private application history and owner slots. Historical SQL/support applications still require an operator-assisted migration; no automatic business approval or migration was performed.

Document collection, malware scanning, document expiry checks, identity/business verification, ownership consent, approval/activation, notifications and granular reviewer permissions remain unfinished. This intake implementation does not complete partner onboarding or production acceptance.

Verification for this change: TypeScript passed; development build passed with the existing large account chunk warning; 33 Functions unit tests, 10 account-server tests and 53 isolated Firestore rules/integration tests passed (96 total). The new emulator cases cover duplicate concurrent intake, consent, unchanged roles, staff/owner boundaries, stale revisions, command replay, correction, withdrawal, replacement applications and scoped history export. Rules reject other-account, anonymous and forged-admin reads and deny client mutations even to administrators. Secret and bundled-demo scans passed. Provider fixtures and the local emulator do not establish live acceptance. Application deletion is integrated into the existing recursive cleanup but a real dual-provider lifecycle acceptance remains outstanding.

## Private partner document intake and scanning

Private, consented document upload, bounded server-side byte checks, durable quarantine reservations, immutable Storage creation, account/application quotas, removal and retention cleanup are implemented. The scanner worker checks actual object generation/content, uses mutual TLS to ClamAV, rejects stale signatures and releases only recognized clean results. Scoped downloads recheck authority and integrity and record access; old scans are renewed. Scan and download audit records are removed with the document. No document grants a partner role or compliance approval. Live bucket/IAM, scanner and certificates have not been provisioned or accepted.

Applicant/reviewer document metadata and save/share UI are connected. Native file handling uses official Capacitor plugins and a bounded temporary cache; web downloads use a temporary Blob. Account export includes document metadata and separately available scanned files. Deployment targets, environment separation and runtime bucket/scanner consistency are checked by release preflight. See ../release/partner-documents.md for the exact operator configuration and acceptance scope.

The file plugin installation exposed incompatible existing Capacitor 7 Firebase plugin peers with Firebase 12. Packages now use Capacitor 8 and the compatible Firebase plugins. Android project settings follow the official Capacitor 8 requirements; iOS targets 15 with scene lifecycle forwarding that preserves the secure-session bridge and Firebase URL handling. The vulnerable transitive UUID version in the CLI's Xcode parser was replaced with compatible CommonJS 11.1.1; the dependency audit reports zero advisories. This does not prove physical-device, native-provider or App Store acceptance. iOS sync skipped CocoaPods/Xcode on Windows; iOS compilation remains unavailable.

Local verification: 38 Functions unit tests, 10 account-server tests and 65 Firestore rules/integration tests passed (113 total). The new cases verify consent/policy binding, quotas under races, durable retry, removal/deletion during upload, bucket privacy/retention rejection, clean/infected/error scan decisions, freshness, integrity-bound access, audit cleanup and expired-document denial. Storage, ClamAV and TLS test transports are fixtures; they do not establish actual cloud IAM, Storage rules runtime, malware engine or TLS acceptance. TypeScript and development build passed, native Android/iOS assets and plugin metadata were synced, and the Xcode project parsed with the patched UUID dependency. Secret/fixture scans passed. No authorized ADB device was connected. Gradle's Java downloader timed out; an official archive was separately fetched and SHA-256 verified, and Android compilation is being checked using that matching cached distribution. Do not treat the compile as passed until its result is recorded.

## Remaining work

The captured-payment stock-failure path now uses the same confirmed refund reconciliation as cancellation. Refund creation responses do not alone mark a payment complete; unresolved records remain discoverable by the worker. The regression uses a provider fixture to verify one refund request, no booking/wallet debit and a confirmed refund journal. Historical processed refunds created by older code may lack journals and need a controlled provider-backed reconciliation migration; they are not accepted merely because their status is refunded. Webhook logs omit raw error objects.

The full audit is still incomplete. Significant source work includes service failure/return workflows, merchant refusal and refund orchestration, grocery substitutions and weighted fulfillment, private partner/evidence uploads, merchant/tax/bank accounting, granular staff permissions, iOS active-job tracking, dispatch escalation, goods/movers implementation and end-to-end/load/accessibility coverage. Live environments, operator policies, actual provider registrations, signing, backup drills and physical devices are also required. No release gate is accepted.
