import type { TripmeSupabaseClient } from "../client";

export async function getGuardianStudents(supabase: TripmeSupabaseClient, guardianId: string) {
  const { data, error } = await supabase
    .from("guardian_student_links")
    .select("students(id, first_name, last_name, photo_url, default_route_id, default_stop_id, qr_token)")
    .eq("guardian_id", guardianId);
  if (error) throw error;
  return (data ?? []).map((row) => row.students).filter(Boolean);
}

/** Active (in_progress) trip, if any, for a student's default route. */
export async function getActiveTripForRoute(supabase: TripmeSupabaseClient, routeId: string) {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("route_id", routeId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (error) throw error;
  return data;
}
