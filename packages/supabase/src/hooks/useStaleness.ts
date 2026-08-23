"use client";

import { useEffect, useState } from "react";

export interface StalenessState {
  isStale: boolean;
  secondsAgo: number | null;
}

const DEFAULT_STALE_THRESHOLD_MS = 90_000;

/**
 * Re-evaluates staleness on a timer, not just when `recordedAt` changes --
 * a position that stops updating (driver's phone off, damaged, or lost)
 * should visibly go stale over time even with no new data arriving, rather
 * than silently looking "live" forever on a frozen last-known position.
 */
export function useStaleness(recordedAt: string | null, thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS): StalenessState {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!recordedAt || now === null) return { isStale: false, secondsAgo: null };

  const secondsAgo = Math.max(0, Math.round((now - new Date(recordedAt).getTime()) / 1000));
  return { isStale: secondsAgo * 1000 > thresholdMs, secondsAgo };
}
