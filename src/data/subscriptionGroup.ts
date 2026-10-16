/** A terminal read failure invalidates every part of a joined subscription. */
export function subscriptionGroup<T>(receive: (value: T) => void, empty: () => T, onError: (error: unknown) => void) {
  let active = true;
  const stops = new Set<() => void>();
  const stop = () => {
    active = false;
    for (const unsubscribe of stops) unsubscribe();
    stops.clear();
  };
  return {
    get active() { return active; },
    add(unsubscribe: () => void) { if (active) stops.add(unsubscribe); else unsubscribe(); },
    publish(value: T) { if (active) receive(value); },
    fail(error: unknown) {
      if (!active) return;
      stop();
      receive(empty());
      onError(error);
    },
    stop,
  };
}
