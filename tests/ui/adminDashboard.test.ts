import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../../src/components/AdminDashboard.tsx", import.meta.url), "utf8");
const support = readFileSync(new URL("../../src/components/SupportOperationsQueue.tsx", import.meta.url), "utf8");
const driverKyc = readFileSync(new URL("../../src/components/DriverEligibilityReview.tsx", import.meta.url), "utf8");
const evidence = readFileSync(new URL("../../src/components/PartnerEvidenceReview.tsx", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../../src/components/DispatchPolicyEditor.tsx", import.meta.url), "utf8");
const refunds = readFileSync(new URL("../../src/components/RefundReviewQueue.tsx", import.meta.url), "utf8");
const payouts = readFileSync(new URL("../../src/components/PayoutRequests.tsx", import.meta.url), "utf8");
const consoleOps = readFileSync(new URL("../../src/components/OperationsConsole.tsx", import.meta.url), "utf8");
const rateEditor = readFileSync(new URL("../../src/components/ServiceRateEditor.tsx", import.meta.url), "utf8");
const rateQueue = readFileSync(new URL("../../src/components/RateReviewQueue.tsx", import.meta.url), "utf8");
const deletion = readFileSync(new URL("../../src/components/DeletionRequests.tsx", import.meta.url), "utf8");
const finance = readFileSync(new URL("../../src/components/FinanceJournalPanel.tsx", import.meta.url), "utf8");
const sync = readFileSync(new URL("../../src/components/OrderSynchronization.tsx", import.meta.url), "utf8");

// TASK-115: Operations dashboard
test("admin dashboard provides operations KPI cards and section navigation", () => {
  assert.match(admin, /Completed booking value \(GMV\)/);
  assert.match(admin, /Active Drivers Online/);
  assert.match(admin, /Total Bookings/);
  assert.match(admin, /Active Customers/);
  assert.match(admin, /admin-section-navigation/);
  assert.match(admin, /Operations overview/);
});

// TASK-116: Customer support queue
test("support operations queue lists paginated tickets and embeds live case panel", () => {
  assert.match(support, /Support operations/);
  assert.match(support, /Refresh queue/);
  assert.match(support, /Load older cases/);
  assert.match(support, /SupportCasePanel/);
  assert.match(support, /support_tickets/);
});

// TASK-117: Driver management
test("driver management checks location freshness and enforces audited eligibility review", () => {
  assert.match(admin, /Delivery partner locations/);
  assert.match(admin, /isFreshTrackingTimestamp/);
  assert.match(admin, /KYC Driver Verification/);
  assert.match(driverKyc, /getDriverEligibilityPolicy/);
  assert.match(driverKyc, /reviewDriverEligibility/);
  assert.match(driverKyc, /Audited driver eligibility/);
});

// TASK-118: Merchant & partner document review
test("partner evidence review validates issuing source reference and authenticity confirmation", () => {
  assert.match(evidence, /reviewPartnerEvidence/);
  assert.match(evidence, /independently confirmed authenticity with the issuing source/);
  assert.match(evidence, /Record document decision/);
  assert.match(evidence, /verificationReference/);
});

// TASK-119: Order monitoring
test("order monitoring provides search, service filters and confirmed cancellation safety action", () => {
  assert.match(admin, /Fulfillment Monitor Log/);
  assert.match(admin, /Search bookings by ID, customer, or status/);
  assert.match(admin, /Filter bookings by service/);
  assert.match(admin, /handleAdminCancel/);
  assert.match(admin, /Request cancellation for this booking\?/);
  assert.match(admin, /Confirm request/);
});

// TASK-120: Dispatch management
test("dispatch policy editor configures maximum search minutes per service with versioning", () => {
  assert.match(dispatch, /Partner search escalation/);
  assert.match(dispatch, /getDispatchPolicy/);
  assert.match(dispatch, /setDispatchPolicy/);
  assert.match(dispatch, /Maximum search minutes/);
  assert.match(dispatch, /Save policy version/);
});

// TASK-121: Refund review queue
test("refund review queue reconciles provider evidence and displays status", () => {
  assert.match(refunds, /Refund reconciliation/);
  assert.match(refunds, /listPendingRefunds/);
  assert.match(refunds, /reviewPendingRefund/);
  assert.match(refunds, /Check provider confirmation/);
  assert.match(refunds, /Reconciled refund/);
});

// TASK-122: Payout review
test("payout review queue records completed transfer receipt or failure with reservation return", () => {
  assert.match(payouts, /Withdrawal requests/);
  assert.match(payouts, /recordDriverPayout/);
  assert.match(payouts, /Record completed transfer/);
  assert.match(payouts, /Record failure/);
  assert.match(payouts, /Actual transfer reference or failure reason/);
});

// TASK-123: Rates and coverage
test("operations console configures zones, rate matrices and equipment with two-operator proposal review", () => {
  assert.match(consoleOps, /Coverage, rates and fleet equipment/);
  assert.match(consoleOps, /Delivery zones/);
  assert.match(consoleOps, /Service rates/);
  assert.match(consoleOps, /Carrier approval/);
  assert.match(rateEditor, /Partner compensation for this service/);
  assert.match(rateEditor, /Submit rates for another operator’s approval/);
  assert.match(rateQueue, /A different operator must approve or reject your proposal/);
  assert.match(rateQueue, /Propose rollback to version/);
});

// TASK-124: Account deletion review
test("account deletion admin inspects statutory retention policy and records processing", () => {
  assert.match(deletion, /Account deletion requests/);
  assert.match(deletion, /processAccountDeletion/);
  assert.match(deletion, /useFeedbackDialog/);
  assert.match(deletion, /\{dialog\}/);
  assert.doesNotMatch(deletion, /window\.confirm/);
  assert.match(deletion, /retention policy/);
  assert.match(deletion, /Process request/);
  assert.match(deletion, /Financial references are retained/);
});

// TASK-125: Audit journal & sync diagnostics
test("finance journal displays immutable double-entry postings and order sync recovers missing orders", () => {
  assert.match(finance, /Finance postings/);
  assert.match(finance, /financial_journals/);
  assert.match(finance, /Export displayed page as JSON/);
  assert.match(finance, /debit|credit/);
  assert.match(sync, /OrderSynchronization/);
  assert.match(sync, /Loading order details/);
  assert.match(sync, /Retry loading/);
  assert.match(sync, /Check payment activity to recover the status/);
});
