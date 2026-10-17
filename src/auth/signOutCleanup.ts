type Cleanup = () => unknown | Promise<unknown>;

// Cleanup uses the current service identity. A failed cleanup must neither skip
// subsequent device cleanup nor retain the primary account session.
export async function signOutWithCleanup(cleanup: Cleanup[], signOutSession: Cleanup) {
  for (const operation of cleanup) {
    try { await operation(); } catch { /* Local sign-out must remain available offline. */ }
  }
  await signOutSession();
}
