const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firestoreDatabaseId } = require('./databaseConfig');

test('development Functions use the same default database as local account sessions', () => {
  assert.equal(firestoreDatabaseId({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8082' }), '(default)');
  assert.equal(firestoreDatabaseId({}), '(default)');
});
test('explicit named databases are preserved', () => {
  assert.equal(firestoreDatabaseId({ FIRESTORE_DATABASE_ID: 'staging-services', ALLGO_ENVIRONMENT: 'staging' }), 'staging-services');
});
test('release Functions still require an explicit database', () => {
  for (const ALLGO_ENVIRONMENT of ['staging', 'production']) {
    assert.throws(() => firestoreDatabaseId({ ALLGO_ENVIRONMENT }), /explicit FIRESTORE_DATABASE_ID/);
    assert.throws(() => firestoreDatabaseId({ ALLGO_ENVIRONMENT, FIRESTORE_DATABASE_ID: ' ' }), /explicit FIRESTORE_DATABASE_ID/);
  }
});
