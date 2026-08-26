import type { InterpolatedPosition, LatLng } from "./route-utils";
import { cumulativeDistancesM, interpolateAlongRoute } from "./route-utils";

export interface AdvanceTripInput {
  points: LatLng[];
  startedAtMs: number;
  nowMs: number;
  /** Average speed for the whole route; a simple stand-in for real telemetry. */
  avgSpeedKmh?: number;
}

export interface AdvanceTripResult extends InterpolatedPosition {
  speedKmh: number;
  isComplete: boolean;
}

const DEFAULT_AVG_SPEED_KMH = 25;

/** Pure function: given a route polyline and elapsed time, where is the bus now? */
export function advanceTrip(input: AdvanceTripInput): AdvanceTripResult {
  const { points, startedAtMs, nowMs, avgSpeedKmh = DEFAULT_AVG_SPEED_KMH } = input;
  const cumulative = cumulativeDistancesM(points);
  const elapsedHours = Math.max(0, nowMs - startedAtMs) / 3_600_000;
  const distanceAlongRouteM = elapsedHours * avgSpeedKmh * 1000;
  const position = interpolateAlongRoute(points, cumulative, distanceAlongRouteM);

  return {
    ...position,
    speedKmh: avgSpeedKmh,
    isComplete: position.totalRouteDistanceM > 0 && position.distanceAlongRouteM >= position.totalRouteDistanceM
  };
}

/** Minutes until the bus reaches a stop located `stopDistanceAlongRouteM` into the route. */
export function computeEtaMinutes(
  distanceAlongRouteM: number,
  stopDistanceAlongRouteM: number,
  avgSpeedKmh: number
): number {
  const remainingM = Math.max(0, stopDistanceAlongRouteM - distanceAlongRouteM);
  const hours = remainingM / Math.max(1, avgSpeedKmh * 1000);
  return Math.round(hours * 60);
}

export * from "./route-utils";
export * from "./location-queue";
