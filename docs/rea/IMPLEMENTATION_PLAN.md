# Implementation checkpoint — 2026-10-23

Use existing domain-specific architecture: PostgreSQL account authority bridges to canonical Firebase identities; Firebase Functions enforce transactional booking, payment and fulfillment policies; role apps reuse the established components and audience build configuration. Do not replace this with a new application or a single generic booking model.

## Current capability

Milestone 1, account input boundary: stop parser error messages reflecting request fragments and reject non-object mutation payloads before handler/provider/database work. Preserve JSON requests with no body used by logout/service identity. Completed code, focused HTTP verification, full regression suite and all 9 real database-backed account integration tests; see TEST_RESULTS.md for provider/native limits.

## Resume order

1. Latest user direction: implement independently from AllGo requirements without waiting for the reference APK or JADX. Preserve historical evidence; no additional Swiggy operation is needed.
2. Continue transaction and authorization repairs, shared customer/merchant/driver runtime alignment and verified builds. Current work is recorded in `../production/2026-10-23-production-work.md`.
3. Reuse the passing account integration evidence for this revision. For future changes, run the isolated PostgreSQL/Auth/Firestore suite with a fresh dedicated test connection; never reuse production application credentials. Complete native account/address acceptance before marking milestone 1 complete.
4. Refine the gap matrix from method evidence and actual AllGo failures. Implement one smallest coherent defect at a time, in priority order: food transaction completion, grocery, merchant, partner dispatch, parcel, rides/vehicle services, administration.
5. Preserve real payment/SMS/maps integrations and report missing credentials. No mock replacement, copied reference code/assets, private endpoints or production-readiness claims.

Milestones 2–8 already have substantial source implementations and tests. Their missing acceptance evidence is not authorization to replace them or add disconnected screens. Re-audit each affected path before changing it.
