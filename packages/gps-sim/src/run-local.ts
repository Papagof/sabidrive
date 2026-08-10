/**
 * Local dev GPS ticker (Phase 1's primary simulator runner — see
 * supabase/functions/gps-tick for the Phase-2-shaped scheduled alternative).
 *
 * Every TICK_MS, advances every `in_progress` trip along its route polyline
 * using the pure engine in ./engine.ts, writes a trip_locations row, upserts
 * ETAs per stop, and raises alerts/notifications on newly-crossed geofences
 * or route deviation. Runs as the Supabase service-role client, so it
 * bypasses RLS — this is the one trusted process allowed to do that for
 * trip-lifecycle tables (see supabase/migrations/0003_rls_policies.sql).
 *
 * Run with `pnpm sim:dev` from the repo root.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { createServiceRoleSupabaseClient } from "@tripme/supabase/server";
import { advanceTrip, computeEtaMinutes } from "./engine";
import {
  cumulativeDistancesM,
  distanceToRouteM,
  isWithinRadiusM,
  projectPointOntoRoute,
  type LatLng
} from "./route-utils";

config({ path: resolve(__dirname, "../../../.env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TICK_MS = 4000;
const ROUTE_DEVIATION_THRESHOLD_M = 250;
const APPROACHING_STOP_ETA_MINUTES = 5;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local at repo root.");
  process.exit(1);
}

const supabase = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface StopGeometry {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  distanceAlongRouteM: number;
}

interface RouteGeometry {
  points: LatLng[];
  cumulative: number[];
  stops: StopGeometry[];
}

interface TripRuntimeState {
  approachedStopIds: Set<string>;
  deviated: boolean;
}

const routeGeometryCache = new Map<string, RouteGeometry>();
const tripRuntimeState = new Map<string, TripRuntimeState>();

async function loadRouteGeometry(routeId: string): Promise<RouteGeometry | null> {
  const cached = routeGeometryCache.get(routeId);
  if (cached) return cached;

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("polyline")
    .eq("id", routeId)
    .single();
  if (routeError || !route) {
    console.error(`route ${routeId} not found`, routeError);
    return null;
  }

  const points = route.polyline as unknown as LatLng[];
  const cumulative = cumulativeDistancesM(points);

  const { data: stopRows, error: stopsError } = await supabase
    .from("stops")
    .select("id, name, lat, lng, radius_m")
    .eq("route_id", routeId);
  if (stopsError || !stopRows) {
    console.error(`stops for route ${routeId} failed to load`, stopsError);
    return null;
  }

  const stops: StopGeometry[] = stopRows.map((s) => ({
    id: s.id as string,
    name: s.name as string,
    lat: s.lat as number,
    lng: s.lng as number,
    radius_m: s.radius_m as number,
    distanceAlongRouteM: projectPointOntoRoute({ lat: s.lat as number, lng: s.lng as number }, points, cumulative)
  }));

  const geometry: RouteGeometry = { points, cumulative, stops };
  routeGeometryCache.set(routeId, geometry);
  return geometry;
}

async function notifyGuardiansOfStop(stopId: string, tripId: string, title: string, body: string) {
  const { data: students } = await supabase.from("students").select("id").eq("default_stop_id", stopId);
  if (!students || students.length === 0) return;

  const studentIds = students.map((s) => s.id as string);
  const { data: links } = await supabase
    .from("guardian_student_links")
    .select("guardian_id, student_id")
    .in("student_id", studentIds);
  if (!links || links.length === 0) return;

  await supabase.from("notifications").insert(
    links.map((l) => ({
      recipient_id: l.guardian_id as string,
      type: "geofence" as const,
      title,
      body,
      related_trip_id: tripId,
      related_student_id: l.student_id as string
    }))
  );
}

async function tickTrip(trip: { id: string; route_id: string; school_id: string; started_at: string; avg_speed_kmh: number }) {
  const geometry = await loadRouteGeometry(trip.route_id);
  if (!geometry) return;

  const state = tripRuntimeState.get(trip.id) ?? { approachedStopIds: new Set<string>(), deviated: false };
  tripRuntimeState.set(trip.id, state);

  const result = advanceTrip({
    points: geometry.points,
    startedAtMs: new Date(trip.started_at).getTime(),
    nowMs: Date.now(),
    avgSpeedKmh: trip.avg_speed_kmh
  });

  await supabase.from("trip_locations").insert({
    trip_id: trip.id,
    lat: result.lat,
    lng: result.lng,
    heading_deg: result.headingDeg,
    speed_kmh: result.speedKmh
  });

  for (const stop of geometry.stops) {
    const etaMinutes = computeEtaMinutes(result.distanceAlongRouteM, stop.distanceAlongRouteM, result.speedKmh);
    await supabase.from("trip_stop_etas").upsert(
      { trip_id: trip.id, stop_id: stop.id, eta_minutes: etaMinutes, distance_m: Math.max(0, stop.distanceAlongRouteM - result.distanceAlongRouteM) },
      { onConflict: "trip_id,stop_id" }
    );

    const isApproaching =
      etaMinutes <= APPROACHING_STOP_ETA_MINUTES || isWithinRadiusM(result, { lat: stop.lat, lng: stop.lng }, stop.radius_m);
    if (isApproaching && !state.approachedStopIds.has(stop.id)) {
      state.approachedStopIds.add(stop.id);
      await notifyGuardiansOfStop(
        stop.id,
        trip.id,
        "Bus approaching your stop",
        `The bus is about ${Math.max(0, etaMinutes)} minute(s) from ${stop.name}.`
      );
    }
  }

  const deviationM = distanceToRouteM(result, geometry.points, geometry.cumulative);
  if (deviationM > ROUTE_DEVIATION_THRESHOLD_M && !state.deviated) {
    state.deviated = true;
    await supabase.from("alerts").insert({
      school_id: trip.school_id,
      trip_id: trip.id,
      type: "route_deviation",
      severity: "warning",
      payload: { deviation_m: Math.round(deviationM) }
    });
  } else if (deviationM <= ROUTE_DEVIATION_THRESHOLD_M) {
    state.deviated = false;
  }
}

async function tick() {
  const { data: activeTrips, error } = await supabase
    .from("trips")
    .select("id, route_id, school_id, started_at, avg_speed_kmh")
    .eq("status", "in_progress");

  if (error) {
    console.error("failed to load active trips", error);
    return;
  }
  if (!activeTrips || activeTrips.length === 0) return;

  for (const tripId of [...tripRuntimeState.keys()]) {
    if (!activeTrips.some((t) => t.id === tripId)) tripRuntimeState.delete(tripId);
  }

  await Promise.all(
    activeTrips.map((trip) =>
      tickTrip(trip as { id: string; route_id: string; school_id: string; started_at: string; avg_speed_kmh: number }).catch(
        (err) => console.error(`tick failed for trip ${trip.id}`, err)
      )
    )
  );

  console.log(`[gps-sim] ticked ${activeTrips.length} active trip(s) at ${new Date().toISOString()}`);
}

console.log(`[gps-sim] starting local ticker, interval=${TICK_MS}ms`);
setInterval(() => void tick(), TICK_MS);
void tick();
