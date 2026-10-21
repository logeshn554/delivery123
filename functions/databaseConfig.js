function firestoreDatabaseId(environment = process.env) {
  const configured = environment.FIRESTORE_DATABASE_ID?.trim();
  if (environment.ALLGO_ENVIRONMENT && !configured) throw new Error('Release Functions require an explicit FIRESTORE_DATABASE_ID.');
  // Match the account API and client development configuration. Looking in a
  // legacy named database makes valid bridge sessions appear to be expired.
  return configured || '(default)';
}
module.exports = { firestoreDatabaseId };
