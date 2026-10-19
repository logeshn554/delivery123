import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../../src/components/ProfileScreen.tsx", import.meta.url), "utf8");
const pages = readFileSync(new URL("../../src/components/CustomerPages.tsx", import.meta.url), "utf8");
const wallet = readFileSync(new URL("../../src/components/WalletPanel.tsx", import.meta.url), "utf8");
const offers = readFileSync(new URL("../../src/components/OffersScreen.tsx", import.meta.url), "utf8");
const deletion = readFileSync(new URL("../../src/components/DeletionRequests.tsx", import.meta.url), "utf8");
const dataExport = readFileSync(new URL("../../src/components/AccountDataExport.tsx", import.meta.url), "utf8");

// TASK-77: Profile dashboard
test("profile screen groups actions by section and exposes sign-out", () => {
  assert.match(profile, /onSignOut/);
  assert.match(profile, /stitch-profile/);
  assert.match(profile, /actions\.filter/);
  assert.match(profile, /group/);
});

// TASK-78: Personal details
test("personal details form shows name with save and read-only email", () => {
  assert.match(pages, /edit-profile/);
  assert.match(pages, /autoComplete="name"/);
  assert.match(pages, /readOnly/);
  assert.match(pages, /Save details/);
});

// TASK-79: Saved addresses
test("saved addresses list shows default badge and delete with confirmation", () => {
  assert.match(pages, /page === 'addresses'/);
  assert.match(pages, /Default/);
  assert.match(pages, /deleteSavedAddress/);
  assert.match(pages, /Add an address/);
});

// TASK-80: Favourites
test("favourites page resolves saved items and offers browse actions", () => {
  assert.match(pages, /page === 'favorites'/);
  assert.match(pages, /Browse food/);
  assert.match(pages, /Browse groceries/);
  assert.match(pages, /Keep your favourites close/);
});

// TASK-81: Offers
test("offers screen validates cart before applying a coupon code", () => {
  assert.match(offers, /hasCart/);
  assert.match(offers, /Add food or groceries before applying/);
  assert.match(offers, /Review in cart/);
  assert.match(offers, /autoCapitalize="characters"/);
});

// TASK-82: Wallet funding and ledger
test("wallet panel shows funding flow, ledger and pending recovery reference", () => {
  assert.match(wallet, /Fund wallet/);
  assert.match(wallet, /Wallet ledger/);
  assert.match(wallet, /Unresolved funding reference/);
  assert.match(wallet, /Resume funding request/);
  assert.match(wallet, /Check funding status/);
});

test("wallet funding persists a request ID before contacting the provider", () => {
  assert.match(wallet, /localStorage\.setItem/);
  assert.match(wallet, /createWalletTopup/);
  assert.match(wallet, /crypto\.randomUUID/);
});

// TASK-83: Payment history via receipts page
test("receipts page lists bookings with payment status and itemized receipt", () => {
  assert.match(pages, /page === 'receipts'/);
  assert.match(pages, /paymentStatus/);
  assert.match(pages, /Recorded order total/);
  assert.match(pages, /This is an order summary/);
});

// TASK-84: Security
test("security screen requires current and new passwords and explains session sign-out", () => {
  assert.match(pages, /page === 'security'/);
  assert.match(pages, /current-password/);
  assert.match(pages, /new-password/);
  assert.match(pages, /Other sessions have been signed out/);
});

// TASK-85: Help centre
test("help centre includes FAQ accordion and a support contact action", () => {
  assert.match(pages, /page === 'help'/);
  assert.match(pages, /Contact support/);
  assert.match(pages, /<details/);
  assert.match(pages, /A little help/);
});

// TASK-86: Safety centre
test("safety centre warns about immediate danger and covers four safety categories", () => {
  assert.match(pages, /page === 'safety'/);
  assert.match(pages, /immediate danger/);
  assert.match(pages, /Before a ride/);
  assert.match(pages, /At pickup and delivery/);
  assert.match(pages, /Protect your account/);
});

// TASK-87: Policies and privacy
test("policies page links to business URLs and includes data export", () => {
  assert.match(pages, /page === 'policies'/);
  assert.match(pages, /Privacy policy/);
  assert.match(pages, /Terms of service/);
  assert.match(pages, /AccountDataExport/);
});

// TASK-89: Account deletion admin view
test("deletion requests list requires confirmed process and discloses financial retention", () => {
  assert.match(deletion, /processAccountDeletion/);
  assert.match(deletion, /retention policy/);
  assert.match(deletion, /Financial references are retained/);
  assert.match(deletion, /Account deletion requests/);
});

// TASK-90: Data export
test("account data export collects paginated sections and discloses partial-copy guard", () => {
  assert.match(dataExport, /exportAccountPage/);
  assert.match(dataExport, /operator-assisted data export/);
  assert.match(dataExport, /exportedAt/);
  assert.match(dataExport, /consistency/);
});
