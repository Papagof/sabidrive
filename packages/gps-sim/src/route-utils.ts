export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two points, in meters. */
export function haversineDistanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, in degrees [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cumulative distance (meters) at each polyline vertex, cumulative[0] === 0. */
export function cumulativeDistancesM(points: LatLng[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const prevPoint = points[i - 1];
    const point = points[i];
    if (!prevPoint || !point) continue;
    cumulative.push(cumulative[i - 1]! + haversineDistanceM(prevPoint, point));
  }
  return cumulative;
}

export interface InterpolatedPosition extends LatLng {
  headingDeg: number;
  distanceAlongRouteM: number;
  totalRouteDistanceM: number;
}

/**
 * Interpolates a position at `distanceAlongRouteM` along a polyline.
 * Distance is clamped to [0, total route length].
 */
export function interpolateAlongRoute(
  points: LatLng[],
  cumulative: number[],
  distanceAlongRouteM: number
): InterpolatedPosition {
  const total = cumulative[cumulative.length - 1] ?? 0;
  const d = Math.max(0, Math.min(distanceAlongRouteM, total));

  if (points.length === 0) {
    throw new Error("interpolateAlongRoute: route has no points");
  }
  if (points.length === 1) {
    const only = points[0]!;
    return { ...only, headingDeg: 0, distanceAlongRouteM: 0, totalRouteDistanceM: 0 };
  }

  let segmentIndex = 0;
  for (let i = 1; i < cumulative.length; i++) {
    if (cumulative[i]! >= d) {
      segmentIndex = i - 1;
      break;
    }
    segmentIndex = i - 1;
  }

  const segStart = points[segmentIndex]!;
  const segEnd = points[segmentIndex + 1] ?? segStart;
  const segStartDist = cumulative[segmentIndex]!;
  const segEndDist = cumulative[segmentIndex + 1] ?? segStartDist;
  const segLen = segEndDist - segStartDist;
  const t = segLen > 0 ? (d - segStartDist) / segLen : 0;

  return {
    lat: lerp(segStart.lat, segEnd.lat, t),
    lng: lerp(segStart.lng, segEnd.lng, t),
    headingDeg: bearingDeg(segStart, segEnd),
    distanceAlongRouteM: d,
    totalRouteDistanceM: total
  };
}

/**
 * Distance (meters) along the route at the closest approach to `point`,
 * used to compute a stop's position within the route for ETA math.
 */
export function projectPointOntoRoute(
  point: LatLng,
  points: LatLng[],
  cumulative: number[]
): number {
  let best = { dist: Infinity, alongM: 0 };
  for (let i = 0; i < points.length - 1; i++) {
    const segStart = points[i]!;
    const segEnd = points[i + 1]!;
    const segStartDist = cumulative[i]!;
    const segEndDist = cumulative[i + 1]!;
    const segLen = segEndDist - segStartDist;
    // Sample a few points along the segment (good enough at bus-route scale).
    const samples = 10;
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const sample: LatLng = {
        lat: lerp(segStart.lat, segEnd.lat, t),
        lng: lerp(segStart.lng, segEnd.lng, t)
      };
      const dist = haversineDistanceM(point, sample);
      if (dist < best.dist) {
        best = { dist, alongM: segStartDist + segLen * t };
      }
    }
  }
  return best.alongM;
}

/** Minimum distance (meters) from `point` to the polyline — used for route-deviation checks. */
export function distanceToRouteM(point: LatLng, points: LatLng[], cumulative: number[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return haversineDistanceM(point, points[0]!);
  const alongM = projectPointOntoRoute(point, points, cumulative);
  const projected = interpolateAlongRoute(points, cumulative, alongM);
  return haversineDistanceM(point, projected);
}

export function isWithinRadiusM(point: LatLng, center: LatLng, radiusM: number): boolean {
  return haversineDistanceM(point, center) <= radiusM;
}
