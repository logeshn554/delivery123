const test = require('node:test');
const assert = require('node:assert/strict');
const { validateParcelContents, separateParcelContacts } = require('./parcelPolicy');
const valid = () => ({ parcelContacts: { senderName: 'Sender Example', senderPhone: '+919876543210', recipientName: 'Recipient Example', recipientPhone: '+919876543211' }, parcelDescription: 'Packed books', declaredValue: 500, fragile: false, restrictedItemsConfirmed: true });
test('parcel metadata keeps canonical fields and ignores untrusted additional fields', () => {
  const input = valid(); input.parcelContacts.role = 'admin'; input.price = 1;
  const result = validateParcelContents(input);
  assert.equal(result.parcelContacts.senderName, 'Sender Example');
  assert.equal(result.declaredValue, 500);
  assert.equal('role' in result.parcelContacts, false);
  assert.equal('price' in result, false);
});
test('parcel validation rejects missing consent, malformed phones and invalid values', () => {
  for (const change of [{ restrictedItemsConfirmed: false }, { declaredValue: -1 }, { declaredValue: Infinity }, { declaredValue: '500' }, { parcelContacts: { ...valid().parcelContacts, recipientPhone: '919876543211' } }, { parcelDescription: '' }]) {
    assert.throws(() => validateParcelContents({ ...valid(), ...change }));
  }
});
test('private contact information cannot enter the public offered-job details', () => {
  const details = { ...validateParcelContents(valid()), weightKg: 2, notes: 'Ring at gate' };
  const result = separateParcelContacts(details);
  assert.equal('parcelContacts' in result.publicDetails, false);
  assert.equal(JSON.stringify(result.publicDetails).includes(details.parcelContacts.recipientPhone), false);
  assert.equal(result.parcelContacts.recipientPhone, details.parcelContacts.recipientPhone);
  assert.equal(details.parcelContacts.senderPhone, '+919876543210');
  assert.equal(result.publicDetails.weightKg, 2);
});
