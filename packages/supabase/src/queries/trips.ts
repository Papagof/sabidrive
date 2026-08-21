import type { SabiDriveSupabaseClient } from "../client";

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
