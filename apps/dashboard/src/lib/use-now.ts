"use client";

import { useEffect, useState } from "react";

/** Current time, re-rendering every `intervalMs` (for "5 min ago" timers). */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
