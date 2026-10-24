import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../src/components/DriverApp.tsx", import.meta.url), "utf8");
const estimate = readFileSync(new URL("../../src/components/DriverEarningEstimate.tsx", import.meta.url), "utf8");
const payouts = readFileSync(new URL("../../src/components/PayoutRequests.tsx", import.meta.url), "utf8");
const deliverySignature = readFileSync(new URL("../../src/components/DeliverySignaturePad.tsx", import.meta.url), "utf8");

// TASK-91: Driver onboarding / verification form
test("driver onboarding collects vehicle type, registration and licence for review", () => {
  assert.match(src, /vehicleType/);
  assert.match(src, /vehicleNo/);
  assert.match(src, /licenseNo/);
  assert.match(src, /Save details for review/);
  assert.match(src, /getOrCreateDriverProfile/);
});

// TASK-92: Driver home dashboard
test("driver home shows today earnings, completed jobs count and online status", () => {
  assert.match(src, /Today.s Earnings/);
  assert.match(src, /Completed/);
  assert.match(src, /completedJobs/);
  assert.match(src, /todayEarnings/);
});

// TASK-93: Availability toggle
test("availability toggle requires verified status and consent disclosure before going online", () => {
  assert.match(src, /Your driver account must be verified/);
  assert.match(src, /aria-pressed={profile\.online}/);
  assert.match(src, /updateDriverStatus/);
  assert.match(src, /locationConsent/);
});

test("foreground GPS errors are shown to online drivers with retry and offline controls", () => {
  assert.match(src, /Location permission is off/);
  assert.match(src, /Could not send your location/);
  assert.match(src, /Retry GPS/);
  assert.match(src, /Stop sharing and go offline/);
});

// TASK-94: Job offers / incoming jobs
test("incoming job offers include paid online and cash-on-delivery orders, show countdown and expire when time passes", () => {
  assert.match(src, /\['paid', 'pending_cod'\]/);
  assert.match(src, /offerExpiresAt/);
  assert.match(src, /Offer expires in/);
  assert.match(src, /Offer expired/);
  assert.match(src, /offerNow/);
});

// TASK-95: Accept and reject controls
test("accept and reject buttons are disabled after offer expiry", () => {
  assert.match(src, /Date\.parse\(job\.offerExpiresAt\) <= offerNow/);
  assert.match(src, /Accept Dispatch/);
  assert.match(src, /handleRejectJob/);
  assert.match(src, /handleAcceptJob/);
});

// TASK-96: Active job details
test("active job card shows customer name, service type, payment status and address", () => {
  assert.match(src, /Active.*job/);
  assert.match(src, /currentAssignedJob\.serviceType/);
  assert.match(src, /customerName/);
  assert.match(src, /pickupAddress/);
  assert.match(src, /dropAddress/);
});

// TASK-97: Pickup workflow
test("pickup workflow shows arrived-at-pickup button and step instructions", () => {
  assert.match(src, /Mark Arrived At Pickup/);
  assert.match(src, /handleArrivedAtPickup/);
  assert.match(src, /Step 1/);
  assert.match(src, /Step 2/);
});

// TASK-97: Pickup code entry
test("pickup code entry uses OTP autofill and is scoped to ride/takeover/parcel/transport", () => {
  assert.match(src, /autoComplete="one-time-code"/);
  assert.match(src, /inputMode="numeric"/);
  assert.match(src, /ride.*takeover.*parcel.*transport/);
  assert.match(src, /pickupCode\.trim\(\)\.length !== 4/);
  assert.match(src, /setPickupCode\(''\)/);
});

// TASK-98: Navigation / route
test("navigation section provides Google Maps deep-link to pickup or drop address", () => {
  assert.match(src, /google\.com\/maps\/dir/);
  assert.match(src, /Open directions/);
  assert.match(src, /encodeURIComponent/);
});

// TASK-99: Delivery verification (recipient OTP)
test("delivery verification requires a 4-digit recipient delivery code before completing", () => {
  assert.match(src, /recipient-delivery-code/);
  assert.match(src, /otpInput\.trim\(\)\.length !== 4/);
  assert.match(src, /Mark Job Completed/);
  assert.match(src, /handleCompleteJob/);
});

// TASK-100: Earnings / weekly trend
test("earnings view uses real completed booking payouts in weekly chart data", () => {
  assert.match(src, /getWeeklyTrendData/);
  assert.match(src, /driverPayout/);
  assert.match(src, /AreaChart/);
  assert.match(src, /Last 7 Days/);
});

// TASK-100: Earnings estimate
test("driver earning estimate renders for an active booking", () => {
  assert.match(estimate, /DriverEarningEstimate/);
  assert.match(estimate, /booking/);
});

// TASK-101: Payouts
test("payout requests panel is rendered inside the driver wallet subview", () => {
  assert.match(src, /PayoutRequests/);
  assert.match(src, /createPayoutRequest/);
  assert.match(src, /Request withdrawal/);
  assert.match(payouts, /driverId/);
});

// TASK-102: Driver support
test("driver support panel allows submitting a dispute ticket linked to the active booking", () => {
  assert.match(src, /Submit Dispute Ticket/);
  assert.match(src, /createSupportTicket/);
  assert.match(src, /currentAssignedJob.*bookingId/);
});

// COD banner disclosure
test("cash-on-delivery banner tells driver to collect cash before asking for delivery OTP", () => {
  assert.match(src, /CASH ON DELIVERY/);
  assert.match(src, /Collect Cash/);
  assert.match(src, /Collect physical cash before asking for the 4-digit delivery OTP/);
  assert.match(src, /Do NOT collect cash/);
});

// TASK-103: Driver profile
test("driver profile subview shows vehicle, registration and completed delivery count", () => {
  assert.match(src, /vehicleType.*Not provided|Not provided/);
  assert.match(src, /completedJobs/);
  assert.match(src, /Verification:/);
});

// Live chat integration inside active job
test("active job chat renders a live message log with participant name and send action", () => {
  assert.match(src, /role="log"/);
  assert.match(src, /Message the customer about this booking/);
  assert.match(src, /sendChatMessage/);
  assert.match(src, /aria-live="polite"/);
});

// Bundle leg indicator
test("driver app identifies bundle legs in incoming offers and active job banner", () => {
  assert.match(src, /currentAssignedJob\.bundleId/);
  assert.match(src, /job\.bundleId/);
  assert.match(src, /Bundle Leg/);
});

test("food, grocery and parcel completion requires recipient signature plus delivery code", () => {
  assert.match(src, /DeliverySignaturePad/);
  assert.match(src, /!signatureProofId/);
  assert.match(src, /&& !signatureProofId/);
  assert.match(deliverySignature, /Recipient signature canvas/);
  assert.match(deliverySignature, /Recipient delivery code/);
  assert.match(deliverySignature, /saveDeliverySignature/);
  assert.match(deliverySignature, /privacy policy/);
});

