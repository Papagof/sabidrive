import { describe, expect, it } from "vitest";
import {
  bearingDeg,
  cumulativeDistancesM,
  distanceToRouteM,
  haversineDistanceM,
  interpolateAlongRoute,
  isWithinRadiusM,
  projectPointOntoRoute,
  type LatLng
} from "./route-utils";

describe("haversineDistanceM", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceM({ lat: 6.5, lng: 3.3 }, { lat: 6.5, lng: 3.3 })).toBe(0);
  });

  it("is symmetric", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 1 };
    expect(haversineDistanceM(a, b)).toBeCloseTo(haversineDistanceM(b, a), 6);
  });

  it("matches the well-known ~111.2km per degree of latitude near the equator", () => {
    const dist = haversineDistanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(dist).toBeGreaterThan(110_800);
    expect(dist).toBeLessThan(111_600);
  });
});

describe("bearingDeg", () => {
  it("points due north as 0deg", () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 6);
  });

  it("points due east as 90deg", () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 6);
  });

  it("points due south as 180deg", () => {
    expect(bearingDeg({ lat: 1, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(180, 6);
  });

  it("points due west as 270deg", () => {
    expect(bearingDeg({ lat: 0, lng: 1 }, { lat: 0, lng: 0 })).toBeCloseTo(270, 6);
  });
});

describe("cumulativeDistancesM", () => {
  it("starts at 0 and is monotonically non-decreasing", () => {
    const points: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 }
    ];
    const cumulative = cumulativeDistancesM(points);
    expect(cumulative).toHaveLength(3);
    expect(cumulative[0]).toBe(0);
    for (let i = 1; i < cumulative.length; i++) {
      expect(cumulative[i]!).toBeGreaterThanOrEqual(cumulative[i - 1]!);
    }
    expect(cumulative[2]).toBeCloseTo(cumulative[1]! + haversineDistanceM(points[1]!, points[2]!), 6);
  });

  it("returns [0] for a single-point route", () => {
    expect(cumulativeDistancesM([{ lat: 0, lng: 0 }])).toEqual([0]);
  });
});

describe("interpolateAlongRoute", () => {
  const points: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 2, lng: 0 }
  ];
  const cumulative = cumulativeDistancesM(points);
  const total = cumulative[cumulative.length - 1]!;

  it("returns the start point at distance 0", () => {
    const pos = interpolateAlongRoute(points, cumulative, 0);
    expect(pos.lat).toBeCloseTo(0, 6);
    expect(pos.distanceAlongRouteM).toBe(0);
  });

  it("returns the midpoint at half the total distance", () => {
    const pos = interpolateAlongRoute(points, cumulative, total / 2);
    expect(pos.lat).toBeCloseTo(1, 6);
    expect(pos.lng).toBeCloseTo(0, 6);
    expect(pos.headingDeg).toBeCloseTo(0, 6);
    expect(pos.totalRouteDistanceM).toBeCloseTo(total, 6);
  });

  it("clamps distance beyond the route end to the last point", () => {
    const pos = interpolateAlongRoute(points, cumulative, total * 10);
    expect(pos.lat).toBeCloseTo(2, 6);
    expect(pos.distanceAlongRouteM).toBeCloseTo(total, 6);
  });

  it("clamps negative distance to the first point", () => {
    const pos = interpolateAlongRoute(points, cumulative, -1000);
    expect(pos.lat).toBeCloseTo(0, 6);
    expect(pos.distanceAlongRouteM).toBe(0);
  });

  it("handles a single-point route without throwing", () => {
    const single: LatLng[] = [{ lat: 6.5, lng: 3.3 }];
    const pos = interpolateAlongRoute(single, cumulativeDistancesM(single), 500);
    expect(pos.lat).toBe(6.5);
    expect(pos.totalRouteDistanceM).toBe(0);
  });
});

describe("projectPointOntoRoute / distanceToRouteM", () => {
  const points: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 2, lng: 0 }
  ];
  const cumulative = cumulativeDistancesM(points);
  const total = cumulative[cumulative.length - 1]!;

  it("projects a point exactly on the route to its true distance-along-route", () => {
    const onRoute = { lat: 1, lng: 0 };
    const alongM = projectPointOntoRoute(onRoute, points, cumulative);
    expect(alongM).toBeCloseTo(total / 2, 0);
  });

  it("returns ~0 distance for a point exactly on the route", () => {
    const onRoute = { lat: 1, lng: 0 };
    expect(distanceToRouteM(onRoute, points, cumulative)).toBeLessThan(1);
  });

  it("returns a larger distance for a point off the route", () => {
    const offRoute = { lat: 1, lng: 0.01 };
    const dist = distanceToRouteM(offRoute, points, cumulative);
    expect(dist).toBeGreaterThan(500);
    expect(Math.abs(dist - haversineDistanceM(offRoute, { lat: 1, lng: 0 }))).toBeLessThan(5);
  });

  it("returns Infinity for an empty route", () => {
    expect(distanceToRouteM({ lat: 0, lng: 0 }, [], [])).toBe(Infinity);
  });
});

describe("isWithinRadiusM", () => {
  const center = { lat: 6.5, lng: 3.3 };

  it("is true for the same point regardless of radius", () => {
    expect(isWithinRadiusM(center, center, 0)).toBe(true);
  });

  it("is false when the point is well outside the radius", () => {
    const far = { lat: 6.5 + 1, lng: 3.3 };
    expect(isWithinRadiusM(far, center, 100_000)).toBe(false);
  });

  it("is true when the point is well inside the radius", () => {
    const far = { lat: 6.5 + 1, lng: 3.3 };
    expect(isWithinRadiusM(far, center, 120_000)).toBe(true);
  });
});
