// Permission dialogs are not awaited during logout. Once a token operation has
// started, drain it before unregister/delete so it cannot win the cleanup race.
export function createPushSession() {
  let generation = 0;
  let accepting = true;
  let invalidating = false;
  const pending = new Set<Promise<unknown>>();
  return {
    capture: (user: object) => ({ user, generation }),
    begin(user: object) {
      if (invalidating) throw new Error('Account cleanup is still running. Try enabling notifications again after signing in.');
      accepting = true;
      return { user, generation };
    },
    current: (snapshot: { user: object; generation: number }, user: object | null) => accepting && snapshot.user === user && snapshot.generation === generation,
    track<T>(operation: () => Promise<T>): Promise<T> {
      const promise = Promise.resolve().then(operation);
      pending.add(promise);
      void promise.then(() => pending.delete(promise), () => pending.delete(promise));
      return promise;
    },
    async invalidate() {
      generation++;
      accepting = false;
      invalidating = true;
      try { await Promise.allSettled([...pending]); }
      finally { invalidating = false; }
    },
  };
}

export const pushSession = createPushSession();
