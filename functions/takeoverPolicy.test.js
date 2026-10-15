const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTakeoverDetails } = require('./takeoverPolicy');

test('takeover booking accepts supported durations and explicit transmission types', () => {
  for (const duration of ['hourly', 'halfday', 'fullday']) {
    for (const transmission of ['manual', 'automatic']) {
      assert.deepEqual(validateTakeoverDetails({ takeoverOption: duration, takeoverTransmission: transmission }), { takeoverOption: duration, takeoverTransmission: transmission });
    }
  }
});

test('takeover booking rejects unsupported durations or missing transmission', () => {
  assert.throws(() => validateTakeoverDetails({ takeoverOption: '2h', takeoverTransmission: 'manual' }), /supported driver duration/);
  assert.throws(() => validateTakeoverDetails({ takeoverOption: 'hourly', takeoverTransmission: 'cvt' }), /manual or automatic/);
  assert.throws(() => validateTakeoverDetails({ takeoverOption: 'hourly' }), /manual or automatic/);
});
