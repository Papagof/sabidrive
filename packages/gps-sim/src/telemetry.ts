/**
 * Simulated instantaneous speed telemetry, layered on top of the constant
 * average speed `advanceTrip` uses for position math (see engine.ts) — only
 * the *displayed/logged* speed gets noise, so the bus still progresses along
 * the route at a sane, predictable pace.
 */
export interface SpeedTelemetryResult {
  speedKmh: number;
  isSpeeding: boolean;
  isHarshBrake: boolean;
}

const SPEEDING_MULTIPLIER = 1.6;
const HARSH_BRAKE_DROP_KMH = 15;
const SPIKE_PROBABILITY = 0.06;
const BRAKE_PROBABILITY = 0.05;
const JITTER_RANGE_KMH = 4;

export function simulateInstantSpeedKmh(baseKmh: number, previousInstantKmh: number | null): SpeedTelemetryResult {
  const jitter = (Math.random() * 2 - 1) * JITTER_RANGE_KMH;
  let speedKmh = Math.max(0, baseKmh + jitter);

  if (Math.random() < SPIKE_PROBABILITY) {
    speedKmh = baseKmh * SPEEDING_MULTIPLIER;
  } else if (previousInstantKmh != null && previousInstantKmh > baseKmh && Math.random() < BRAKE_PROBABILITY) {
    speedKmh = Math.max(0, previousInstantKmh - HARSH_BRAKE_DROP_KMH - Math.random() * 10);
  }

  const isSpeeding = speedKmh >= baseKmh * SPEEDING_MULTIPLIER;
  const isHarshBrake = previousInstantKmh != null && previousInstantKmh - speedKmh >= HARSH_BRAKE_DROP_KMH;

  return { speedKmh, isSpeeding, isHarshBrake };
}
