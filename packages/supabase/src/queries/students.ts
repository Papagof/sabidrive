import type { TripmeSupabaseClient } from "../client";

interface GuardianStudentRow {
  students: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url: string | null;
    default_route_id: string | null;
    default_stop_id: string | null;
    qr_token: string;
  } | null;
}

export async function getGuardianStudents(supabase: TripmeSupabaseClient, guardianId: string) {
  const { data, error } = await supabase
    .from("guardian_student_links")
    .select("students(id, first_name, last_name, photo_url, default_route_id, default_stop_id, qr_token)")
    .eq("guardian_id", guardianId);
  if (error) throw error;
  return ((data ?? []) as unknown as GuardianStudentRow[]).map((row) => row.students).filter(Boolean);
}

export interface PickupInfo {
  student: { id: string; first_name: string; last_name: string; qr_token: string } | null;
  authorizedGuardians: { full_name: string }[];
  todaysOverrides: { authorized_name: string; authorized_relationship: string | null; notes: string | null }[];
}

/**
 * Looks up a student by QR token plus who's authorized to receive them at
 * drop-off — used by the driver's Scan screen to confirm identity before an
 * `alight` check-in (two-factor pickup authorization).
 */
export async function getPickupInfo(supabase: TripmeSupabaseClient, qrToken: string): Promise<PickupInfo> {
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, first_name, last_name, qr_token")
    .eq("qr_token", qrToken)
    .maybeSingle();
  if (studentError) throw studentError;
  if (!student) return { student: null, authorizedGuardians: [], todaysOverrides: [] };

  const { data: links, error: linksError } = await supabase
    .from("guardian_student_links")
    .select("profiles:guardian_id(full_name)")
    .eq("student_id", student.id)
    .eq("is_authorized_pickup", true);
  if (linksError) throw linksError;

  const today = new Date().toISOString().slice(0, 10);
  const { data: overrides, error: overridesError } = await supabase
    .from("pickup_overrides")
    .select("authorized_name, authorized_relationship, notes")
    .eq("student_id", student.id)
    .eq("valid_date", today);
  if (overridesError) throw overridesError;

  return {
    student,
    authorizedGuardians: ((links ?? []) as unknown as { profiles: { full_name: string } | null }[])
      .map((l) => l.profiles)
      .filter((p): p is { full_name: string } => p !== null),
    todaysOverrides: overrides ?? []
  };
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
