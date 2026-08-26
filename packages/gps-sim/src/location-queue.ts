/**
 * Pure bounded-queue logic for offline GPS reporting (apps/family/src/lib/useLiveLocationSharing.ts).
 * A driver who briefly loses network shouldn't silently drop location fixes --
 * they get queued locally and replayed in order once back online. Kept pure
 * and storage-agnostic (no localStorage/browser APIs here) so it's unit-testable
 * the same way as this package's other trip-location-adjacent math.
 */
export interface QueuedLocationFix {
  lat: number;
  lng: number;
  headingDeg: number | null;
  speedKmh: number | null;
  deviationM: number | null;
  stopEtas: { stop_id: string; eta_minutes: number; distance_m: number }[];
  /** ISO timestamp of when the fix was actually captured, not when it's eventually sent. */
  recordedAt: string;
}

/**
 * Appends a fix to the queue, evicting the oldest entries first if the queue
 * would exceed maxSize -- recency matters more than completeness for live
 * tracking, so a long offline stretch loses its earliest points, not its
 * latest. Returns a new array; does not mutate the input.
 */
export function enqueueLocationFix(
  queue: QueuedLocationFix[],
  fix: QueuedLocationFix,
  maxSize: number
): QueuedLocationFix[] {
  const next = [...queue, fix];
  if (next.length <= maxSize) return next;
  return next.slice(next.length - maxSize);
}
