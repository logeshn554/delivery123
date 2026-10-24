import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const takeoverSrc = readFileSync(new URL('../../src/components/TakeoverOrderDetails.tsx', import.meta.url), 'utf8');
const transportSrc = readFileSync(new URL('../../src/components/TransportOrderDetails.tsx', import.meta.url), 'utf8');
const operatorSrc = readFileSync(new URL('../../src/components/TransportOperatorDashboard.tsx', import.meta.url), 'utf8');
const adminSrc = readFileSync(new URL('../../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const transportSettlementQueueSrc = readFileSync(new URL('../../src/components/TransportSettlementQueue.tsx', import.meta.url), 'utf8');
const transportTollQueueSrc = readFileSync(new URL('../../src/components/TransportTollReviewQueue.tsx', import.meta.url), 'utf8');
const transportTollFormSrc = readFileSync(new URL('../../src/components/TransportTollClaimForm.tsx', import.meta.url), 'utf8');
const transportBookingSrc = readFileSync(new URL('../../src/components/TransportBookingScreen.tsx', import.meta.url), 'utf8');
const trackingSrc = readFileSync(new URL('../../src/components/OrderTrackingScreen.tsx', import.meta.url), 'utf8');
const driverAppSrc = readFileSync(new URL('../../src/components/DriverApp.tsx', import.meta.url), 'utf8');
const customerAppSrc = readFileSync(new URL('../../src/components/CustomerApp.tsx', import.meta.url), 'utf8');

test('TakeoverOrderDetails renders vehicle model, transmission badge, and pre-trip protocol', () => {
  assert.match(takeoverSrc, /takeoverVehicleModel/);
  assert.match(takeoverSrc, /takeoverVehicleNo/);
  assert.match(takeoverSrc, /takeoverTransmission === 'automatic' \? 'Automatic' : 'Manual'/);
  assert.match(takeoverSrc, /Full Day \(8 Hours\)/);
  assert.match(takeoverSrc, /Half Day \(4 Hours\)/);
  assert.match(takeoverSrc, /Hourly Hire/);
  assert.match(takeoverSrc, /Pre-Trip Handover & Safety Protocol/);
  assert.match(takeoverSrc, /Jointly check odometer, fuel\/battery level/);
  assert.match(takeoverSrc, /Trip start code/);
  assert.match(takeoverSrc, /Trip completion code/);
  assert.match(takeoverSrc, /BookingTimeline/);
});

test('TransportOrderDetails renders carrier loading checklist and vehicle condition', () => {
  assert.match(transportSrc, /transportMakeModel/);
  assert.match(transportSrc, /transportRegNo/);
  assert.match(transportSrc, /Carrier Handover & Loading Checklist/);
  assert.match(transportSrc, /Inspect vehicle body for pre-existing scratches/);
  assert.match(transportSrc, /4-point wheel tie-down straps/);
  assert.match(transportSrc, /Sender pickup code/);
  assert.match(transportSrc, /Recipient delivery code/);
  assert.match(transportSrc, /the transport operator/);
  assert.match(transportSrc, /awaiting transport operator or AllGo operations confirmation/);
});

test('Transport operator dashboard shows authoritative booking price and can review the requested pickup slot', () => {
  assert.match(operatorSrc, /Customer booking price/);
  assert.match(operatorSrc, /reviewTransportPickupTime/);
  assert.match(operatorSrc, /Confirm pickup time/);
  assert.match(operatorSrc, /Decline pickup time/);
  assert.match(operatorSrc, /expectedRevision/);
  assert.match(operatorSrc, /Transport settlements & withdrawals/);
  assert.match(operatorSrc, /withdrawable only after operations review/);
  assert.match(operatorSrc, /requestTransportOperatorPayout/);
  assert.match(operatorSrc, /Request payout/);
  assert.match(adminSrc, /<TransportSettlementQueue/);
  assert.match(transportSettlementQueueSrc, /Approve payable/);
  assert.match(transportSettlementQueueSrc, /Reject settlement/);
  assert.match(adminSrc, /<TransportTollReviewQueue/);
  assert.match(transportTollQueueSrc, /View receipt evidence/);
  assert.match(transportTollQueueSrc, /Approve reimbursement/);
  assert.match(transportTollQueueSrc, /Reject claim/);
  assert.match(transportTollFormSrc, /Receipt photo/);
  assert.match(driverAppSrc, /<TransportTollClaimForm/);
});

test('Transport checkout requests an operator quote and requires customer acceptance before payment', () => {
  assert.match(transportBookingSrc, /listTransportOperators/);
  assert.match(transportBookingSrc, /requestTransportQuote/);
  assert.match(transportBookingSrc, /getTransportQuoteRequest/);
  assert.match(transportBookingSrc, /Accept operator quote/);
  assert.match(transportBookingSrc, /Confirm & pay/);
  assert.match(transportBookingSrc, /Payment starts only after acceptance/);
});

test('OrderTrackingScreen provides dedicated tracking views for takeover and vehicle transport', () => {
  assert.match(trackingSrc, /isTakeover/);
  assert.match(trackingSrc, /isTransport/);
  assert.match(trackingSrc, /VEHICLE FOR DRIVER HIRE/);
  assert.match(trackingSrc, /VEHICLE BEING TRANSPORTED/);
  assert.match(trackingSrc, /Driving your vehicle/);
  assert.match(trackingSrc, /In transit on carrier/);
  assert.match(trackingSrc, /Vehicle handover start code/);
  assert.match(trackingSrc, /Vehicle delivery code/);
});

test('DriverApp integrates takeover and transport checklists with start and completion codes', () => {
  assert.match(driverAppSrc, /TakeoverOrderDetails/);
  assert.match(driverAppSrc, /TransportOrderDetails/);
  assert.match(driverAppSrc, /Driver takeover assigned\. Drive to customer vehicle location\./);
  assert.match(driverAppSrc, /Vehicle transport assigned\. Drive carrier to pickup location\./);
  assert.match(driverAppSrc, /Passenger trip start code.*Vehicle handover start code/);
  assert.match(driverAppSrc, /Passenger trip completion code.*Vehicle delivery code/);
});

test('CustomerApp renders TakeoverOrderDetails alongside transport in order history and active orders', () => {
  assert.match(customerAppSrc, /import TakeoverOrderDetails/);
  assert.match(customerAppSrc, /<TakeoverOrderDetails booking=\{bk\}/);
  assert.match(customerAppSrc, /Personal driver help ·/);
});
