import { describe, expect, it } from "vitest";
import { advanceTrip, computeEtaMinutes } from "./engine";
import type { LatLng } from "./route-utils";

describe("advanceTrip", () => {
  const points: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 2, lng: 0 }
  ];
  const startedAtMs = 0;

  it("is at the route start with no elapsed time", () => {
    const result = advanceTrip({ points, startedAtMs, nowMs: startedAtMs, avgSpeedKmh: 25 });
    expect(result.distanceAlongRouteM).toBe(0);
    expect(result.lat).toBeCloseTo(0, 6);
    expect(result.isComplete).toBe(false);
  });

  it("reports the given average speed", () => {
    const result = advanceTrip({ points, startedAtMs, nowMs: startedAtMs, avgSpeedKmh: 40 });
    expect(result.speedKmh).toBe(40);
  });

  it("defaults to 25 km/h when no average speed is given", () => {
    const result = advanceTrip({ points, startedAtMs, nowMs: startedAtMs });
    expect(result.speedKmh).toBe(25);
  });

  it("marks the trip complete once enough time has elapsed to cover the whole route", () => {
    // The route is ~222km (2 degrees of latitude); at 1000km/h it's covered in well under an hour.
    const nowMs = startedAtMs + 60 * 60 * 1000;
    const result = advanceTrip({ points, startedAtMs, nowMs, avgSpeedKmh: 1000 });
    expect(result.isComplete).toBe(true);
    expect(result.lat).toBeCloseTo(2, 6);
  });

  it("never goes negative for a nowMs before startedAtMs", () => {
    const result = advanceTrip({ points, startedAtMs: 10_000, nowMs: 0, avgSpeedKmh: 25 });
    expect(result.distanceAlongRouteM).toBe(0);
  });
});

describe("computeEtaMinutes", () => {
  it("computes minutes remaining at a steady average speed", () => {
    // 25km remaining at 25km/h = exactly 1 hour = 60 minutes.
    expect(computeEtaMinutes(0, 25_000, 25)).toBe(60);
  });

  it("returns 0 once the stop has already been passed", () => {
    expect(computeEtaMinutes(30_000, 25_000, 25)).toBe(0);
  });

  it("does not divide by zero at 0 km/h", () => {
    expect(computeEtaMinutes(0, 1000, 0)).toBe(60_000);
  });
});
