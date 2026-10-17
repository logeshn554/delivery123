// Keep one teardown in flight. A replacement sign-in must wait until native
// credentials and device services from the previous session have stopped.
export function createSessionTeardown() {
  let pending: Promise<void> | undefined;
  return {
    get running() { return pending !== undefined; },
    run(operation: () => Promise<void>) {
      if (pending) return pending;
      const current = Promise.resolve().then(operation);
      pending = current;
      const clear = () => { if (pending === current) pending = undefined; };
      void current.then(clear, clear);
      return current;
    },
    async wait() {
      try { await pending; } catch { /* A new explicit sign-in can replace failed local credentials. */ }
    },
  };
}
