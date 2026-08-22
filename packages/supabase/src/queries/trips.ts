import type { SabiDriveSupabaseClient } from "../client";
import type { Json } from "../types.gen";

export async function startTrip(supabase: SabiDriveSupabaseClient, busId: string, direction: "pickup" | "dropoff" = "pickup") {
  const { data, error } = await supabase.rpc("start_trip", { p_bus_id: busId, p_direction: direction });
  if (error) throw error;
  return data as string;
}

export async function endTrip(supabase: SabiDriveSupabaseClient, tripId: string) {
  const { error } = await supabase.rpc("end_trip", { p_trip_id: tripId });
  if (error) throw error;
}

export async function checkIn(
  supabase: SabiDriveSupabaseClient,
  tripId: string,
  qrToken: string,
  eventType: "board" | "alight" = "board"
) {
  const { error } = await supabase.rpc("check_in", { p_trip_id: tripId, p_qr_token: qrToken, p_event_type: eventType });
  if (error) throw error;
}

export async function getDriverBus(supabase: SabiDriveSupabaseClient, driverId: string) {
  const { data, error } = await supabase
    .from("buses")
    .select("*, routes:default_route_id(id, name, polyline)")
    .or(`driver_id.eq.${driverId},attendant_id.eq.${driverId}`)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTripWithDriverContact(supabase: SabiDriveSupabaseClient, tripId: string) {
  const { data, error } = await supabase
    .from("trips")
    .select("id, bus_id, buses!trips_bus_id_fkey(label, driver:driver_id(full_name, phone, verification_status))")
    .eq("id", tripId)
    .single();
  if (error) throw error;
  return data;
}

export async function getAttendanceForTrip(supabase: SabiDriveSupabaseClient, tripId: string) {
  const { data, error } = await supabase
    .from("attendance_expectations")
    .select("*, students(first_name, last_name)")
    .eq("trip_id", tripId);
  if (error) throw error;
  return data;
}

export interface TripRouteGeometry {
  id: string;
  avg_speed_kmh: number;
  routes: {
    id: string;
    polyline: { lat: number; lng: number }[];
    stops: { id: string; name: string; lat: number; lng: number; radius_m: number }[];
  } | null;
}

/** Route polyline + stops for a trip -- the geometry the driver's browser needs to turn a raw GPS fix into an ETA per stop. */
export async function getTripRouteGeometry(supabase: SabiDriveSupabaseClient, tripId: string) {
  const { data, error } = await supabase
    .from("trips")
    .select("id, avg_speed_kmh, routes:route_id(id, polyline, stops(id, name, lat, lng, radius_m))")
    .eq("id", tripId)
    .single();
  if (error) throw error;
  return data as unknown as TripRouteGeometry;
}

export interface StopEtaInput {
  stop_id: string;
  eta_minutes: number;
  distance_m: number;
}

export interface RecordTripLocationInput {
  lat: number;
  lng: number;
  headingDeg?: number | null;
  speedKmh?: number | null;
  deviationM?: number | null;
  stopEtas: StopEtaInput[];
}

/**
 * Reports the driver's real position (from the browser's Geolocation API)
 * for an in-progress trip. Per-stop ETAs and route-deviation distance are
 * computed client-side with @sabidrive/gps-sim's route math (pure geometry,
 * no security weight); the RPC independently decides whether that adds up
 * to a speeding/harsh-brake/deviation alert or a stop-approach notification
 * (see 0027_live_driver_gps.sql).
 */
export async function recordTripLocation(supabase: SabiDriveSupabaseClient, tripId: string, input: RecordTripLocationInput) {
  const { error } = await supabase.rpc("record_trip_location", {
    p_trip_id: tripId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_heading_deg: input.headingDeg ?? undefined,
    p_speed_kmh: input.speedKmh ?? undefined,
    p_deviation_m: input.deviationM ?? undefined,
    p_stop_etas: input.stopEtas as unknown as Json
  });
  if (error) throw error;
}
