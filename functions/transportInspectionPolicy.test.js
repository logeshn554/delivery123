const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTransportInspection, validateInspectionPhotos, requireTransportInspection } = require('./transportInspectionPolicy');
const clean = value => { if (typeof value !== 'string') throw new Error('Notes required'); return value.trim().slice(0, 500); };

test('pickup inspection requires each custody and loading check plus condition notes', () => {
  const checklist = { conditionRecorded: true, odometerAndFuelChecked: true, personalItemsRemoved: true, loadingSecured: true };
  assert.deepEqual(validateTransportInspection('pickup', checklist, 'No visible damage.', clean), { checklist, conditionNotes: 'No visible damage.' });
  assert.throws(() => validateTransportInspection('pickup', { ...checklist, loadingSecured: false }, 'No damage', clean));
  assert.throws(() => validateTransportInspection('pickup', checklist, '  ', clean));
});

test('delivery inspection records condition comparison and customer handover checks', () => {
  const checklist = { unloadedWithCustomer: true, conditionCompared: true, keysAndItemsReturned: true, handoverCompleted: true };
  assert.deepEqual(validateTransportInspection('delivery', checklist, 'Condition unchanged.', clean), { checklist, conditionNotes: 'Condition unchanged.' });
  assert.throws(() => validateTransportInspection('delivery', { ...checklist, conditionCompared: false }, 'Condition unchanged', clean));
});

test('pickup and delivery transitions require their own recorded inspection', () => {
  const pickup = { stage: 'pickup', status: 'recorded', checklist: { conditionRecorded: true, odometerAndFuelChecked: true, personalItemsRemoved: true, loadingSecured: true } };
  const delivery = { stage: 'delivery', status: 'recorded', checklist: { unloadedWithCustomer: true, conditionCompared: true, keysAndItemsReturned: true, handoverCompleted: true } };
  assert.doesNotThrow(() => requireTransportInspection('pickup', pickup));
  assert.doesNotThrow(() => requireTransportInspection('delivery', delivery));
  assert.throws(() => requireTransportInspection('delivery', pickup));
  assert.throws(() => requireTransportInspection('pickup', { ...pickup, status: 'pending' }));
});

test('inspection photos require one or two bounded images matching their declared format', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(validateInspectionPhotos([{ contentType: 'image/png', base64: png.toString('base64') }]), [{ contentType: 'image/png', base64: png.toString('base64') }]);
  assert.throws(() => validateInspectionPhotos([]));
  assert.throws(() => validateInspectionPhotos([{ contentType: 'image/png', base64: Buffer.from('bad').toString('base64') }]));
  assert.throws(() => validateInspectionPhotos([{ contentType: 'image/png', base64: Buffer.alloc(300 * 1024 + 1).toString('base64') }]));
});
