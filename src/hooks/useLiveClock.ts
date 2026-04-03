import { useEffect, useState } from "react";

/**
 * Returns a counter that increments every `intervalMs` (default 60s).
 * Components that consume relative time can depend on this tick to re-render.
 */
export function useLiveClock(intervalMs = 60_000) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return tick;
}
