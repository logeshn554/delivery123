const test = require('node:test');
const assert = require('node:assert/strict');
const { containsPoint, checkCoverage, calculateFare } = require('./bookingPolicy');
const { validateParcelContents, separateParcelContacts } = require('./parcelPolicy');

test('SEC-06: delivery zone serviceability validates food and grocery boundaries', () => {
  const serviceZones = [
    {
      id: 'downtown-zone',
      enabled: true,
      serviceTypes: ['food', 'grocery', 'parcel'],
      polygon: [
        { lat: 12.90, lng: 80.10 },
        { lat: 13.10, lng: 80.10 },
        { lat: 13.10, lng: 80.30 },
        { lat: 12.90, lng: 80.30 }
      ]
    }
  ];

  // Inside zone
  const valid = checkCoverage(
    serviceZones,
    'food',
    { lat: 12.95, lng: 80.15 },
    { lat: 13.05, lng: 80.25 },
    true
  );
  assert.equal(valid.pickupZoneId, 'downtown-zone');
  assert.equal(valid.dropZoneId, 'downtown-zone');

  // Outside zone should throw
  assert.throws(() => {
    checkCoverage(
      serviceZones,
      'grocery',
      { lat: 12.95, lng: 80.15 },
      { lat: 14.50, lng: 80.25 },
      true
    );
  }, /outside the configured service coverage/);
});

test('SEC-01 & SEC-06: fare calculation prevents negative rates, zero division, and excessive distances', () => {
  const validOption = { price: 40, perKm: 12, perMinute: 2, minimumPrice: 50, maxKm: 30 };
  const validRoute = { distanceMeters: 5000, durationSeconds: 600 }; // 5km, 10 min

  const fare = calculateFare(validOption, validRoute);
  assert.equal(fare, 40 + 5 * 12 + 10 * 2); // 120

  // Price cannot be manipulated to negative
  assert.throws(() => calculateFare({ price: -10 }, validRoute), /not configured/);

  // Journey over maxKm rejected
  assert.throws(() => calculateFare(validOption, { distanceMeters: 35000, durationSeconds: 3000 }), /exceeds the configured distance limit/);
});

test('SEC-04: parcel contact details are isolated from public driver feed', () => {
  const rawBooking = {
    parcelDescription: 'Medical documents',
    declaredValue: 200,
    fragile: true,
    restrictedItemsConfirmed: true,
    parcelContacts: {
      senderName: 'Alice Customer',
      senderPhone: '+919876500001',
      recipientName: 'Bob Doctor',
      recipientPhone: '+919876500002'
    }
  };

  const validated = validateParcelContents(rawBooking);
  const { publicDetails, parcelContacts } = separateParcelContacts(validated);

  // Private contacts must not be in public details
  assert.equal(publicDetails.parcelContacts, undefined);
  assert.equal(JSON.stringify(publicDetails).includes('+919876500001'), false);
  assert.equal(JSON.stringify(publicDetails).includes('+919876500002'), false);

  // Sensitive contacts retained in private object
  assert.equal(parcelContacts.recipientPhone, '+919876500002');
});
