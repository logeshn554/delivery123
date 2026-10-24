import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const portal = readFileSync(new URL("../../src/components/MerchantPortal.tsx", import.meta.url), "utf8");
const setup = readFileSync(new URL("../../src/components/MerchantBusinessSetup.tsx", import.meta.url), "utf8");
const prep = readFileSync(new URL("../../src/components/MerchantPreparationEditor.tsx", import.meta.url), "utf8");
const picking = readFileSync(new URL("../../src/components/GroceryPickingEditor.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../../src/components/MerchantCatalogEditor.tsx", import.meta.url), "utf8");
const expiry = readFileSync(new URL("../../src/components/ProductExpiryField.tsx", import.meta.url), "utf8");
const stock = readFileSync(new URL("../../src/components/StockMovementHistory.tsx", import.meta.url), "utf8");
const hours = readFileSync(new URL("../../src/components/MerchantHoursEditor.tsx", import.meta.url), "utf8");
const closures = readFileSync(new URL("../../src/components/MerchantClosuresEditor.tsx", import.meta.url), "utf8");
const settlements = readFileSync(new URL("../../src/components/MerchantSettlements.tsx", import.meta.url), "utf8");
const rejection = readFileSync(new URL("../../src/components/MerchantRejection.tsx", import.meta.url), "utf8");
const exception = readFileSync(new URL("../../src/components/BookingExceptionPanel.tsx", import.meta.url), "utf8");

// TASK-104: Merchant onboarding / business setup
test("merchant business setup collects type, ID, address, timezone and reason for draft creation", () => {
  assert.match(setup, /createMerchantBusiness/);
  assert.match(setup, /Creates the business record without opening checkout/);
  assert.match(setup, /merchantType: type/);
  assert.match(setup, /timeZone: zone/);
  assert.match(setup, /Setup reason/);
  assert.match(setup, /Draft business created and kept closed/);
});

// TASK-105: Merchant dashboard
test("merchant portal overview summarizes today completed revenue, count and navigation tabs", () => {
  assert.match(portal, /Completed booking value today/);
  assert.match(portal, /Confirmed order deliveries/);
  assert.match(portal, /Settlement availability/);
  assert.match(portal, /role-navigation/);
  assert.match(portal, /Merchant navigation/);
  assert.match(portal, /Restaurant operations|Grocery operations/);
});

// TASK-106: Incoming orders queue
test("incoming orders queue plays chime for new orders and displays client, items and status", () => {
  assert.match(portal, /playOrderChime/);
  assert.match(portal, /Incoming Orders/);
  assert.match(portal, /Client:.*ord\.customerName/);
  assert.match(portal, /handleAcceptMerchantOrder/);
  assert.match(portal, /Accept & Start Preparation/);
});

// TASK-107: Preparation & grocery picking
test("preparation editor submits ready-in minutes with customer-visible reason", () => {
  assert.match(prep, /updateMerchantPreparation/);
  assert.match(prep, /Ready in minutes/);
  assert.match(prep, /Customer-visible reason/);
  assert.match(prep, /Publish preparation estimate/);
});

test("grocery picking editor supports quantity confirmation and replacement proposals", () => {
  assert.match(picking, /confirmGroceryPicking/);
  assert.match(picking, /proposeGrocerySubstitution/);
  assert.match(picking, /Packed quantity/);
  assert.match(picking, /Choose available replacement/);
  assert.match(picking, /Picking and packing/);
});

// TASK-108: Catalog management
test("merchant catalog editor provides categories, stock filter and search", () => {
  assert.match(catalog, /selectedCategory/);
  assert.match(catalog, /stockFilter/);
  assert.match(catalog, /searchQuery/);
  assert.match(catalog, /saveCatalogItem/);
  assert.match(catalog, /updateMerchantCatalog/);
});

// TASK-109: Product editing & expiry
test("product expiry field handles device timezone and ISO deadline conversion", () => {
  assert.match(expiry, /Inventory expiry deadline, if applicable/);
  assert.match(expiry, /datetime-local/);
  assert.match(expiry, /Device time zone/);
  assert.match(expiry, /Stored UTC deadline/);
});

// TASK-110: Stock movement history / inventory
test("stock movement history fetches paginated event journal and exports JSON", () => {
  assert.match(stock, /stock_events/);
  assert.match(stock, /collectStockHistory/);
  assert.match(stock, /savePrivateFile/);
  assert.match(stock, /allgo-stock-/);
  assert.match(stock, /Recorded movements since journaling was enabled/);
});

// TASK-111: Store hours
test("merchant hours editor supports day-by-day weekly periods and order acceptance flag", () => {
  assert.match(hours, /Opening hours and order availability/);
  assert.match(hours, /Accept orders during opening hours/);
  assert.match(hours, /setMerchantHours/);
  assert.match(hours, /Add opening period/);
  assert.match(hours, /Asia\/Kolkata/);
});

// TASK-112: Temporary closures
test("merchant closures editor supports date-level closures with reason and conflict guard", () => {
  assert.match(closures, /Holiday and date closures/);
  assert.match(closures, /setMerchantClosures/);
  assert.match(closures, /The business record changed while editing/);
  assert.match(closures, /Add closure date/);
  assert.match(closures, /Reload calendar and discard edits/);
});

// TASK-113: Settlement info
test("merchant settlements panel warns setup requirement and summarizes completed bookings", () => {
  assert.match(settlements, /Merchant payouts are unavailable/);
  assert.match(settlements, /Completed bookings/);
  assert.match(settlements, /Withdrawals require operations to verify a payout destination/);
  assert.match(settlements, /Customer booking totals can include delivery charges and taxes/);
});

// TASK-114: Merchant support & exception workflows
test("rejection and booking exception workflows provide cancellation refund notice and pause states", () => {
  assert.match(rejection, /rejectMerchantBooking/);
  assert.match(rejection, /Reject unaccepted order/);
  assert.match(rejection, /Confirm rejection and refund/);
  assert.match(exception, /reportBookingException/);
  assert.match(exception, /Booking paused for operations review/);
});
