type Operation = () => unknown | Promise<unknown>;

// Credential-store errors must remain visible, while every in-memory identity
// and subscriber still reaches its signed-out state.
export async function invalidateSession(removeStoredSession: Operation, clearServiceIdentity: Operation, publishSignedOut: Operation, isCurrent: () => boolean = () => true) {
  try { await removeStoredSession(); }
  finally {
    try { if (isCurrent()) await clearServiceIdentity(); }
    finally { if (isCurrent()) await publishSignedOut(); }
  }
}
