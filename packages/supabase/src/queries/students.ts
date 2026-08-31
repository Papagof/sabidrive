import type { SabiDriveSupabaseClient } from "../client";
import type { TripHistoryAttendanceRow, TripHistoryCheckInRow } from "../tripHistory";

interface GuardianStudentRow {
  students: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url: string | null;
    default_route_id: string | null;
    default_stop_id: string | null;
    qr_token: string;
    school_id: string;
    schools: { name: string } | null;
  } | null;
}

/** A guardian's children, with each child's school name -- lets a parent with kids at different schools tell them apart. */
export async function getGuardianStudents(supabase: SabiDriveSupabaseClient, guardianId: string) {
  const { data, error } = await supabase
    .from("guardian_student_links")
    .select(
      "students(id, first_name, last_name, photo_url, default_route_id, default_stop_id, qr_token, school_id, schools(name))"
    )
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
export async function getPickupInfo(supabase: SabiDriveSupabaseClient, qrToken: string): Promise<PickupInfo> {
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
export async function getActiveTripForRoute(supabase: SabiDriveSupabaseClient, routeId: string) {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("route_id", routeId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface TripHistoryData {
  attendance: TripHistoryAttendanceRow[];
  checkIns: TripHistoryCheckInRow[];
  timeZone: string;
}

/**
 * Raw rows for a student's trip history (see tripHistory.ts's buildTripHistory
 * for the merge/on-time logic) -- anchored on attendance_expectations (which
 * always exists once a trip starts) rather than only check_in_events, so a
 * missed pickup still shows up rather than being silently absent. can_view_trip
 * already permits a guardian to read past (not just in-progress) trips for
 * their own child, so no new RLS is needed here.
 */
export async function getTripHistoryForStudent(
  supabase: SabiDriveSupabaseClient,
  studentId: string,
  sinceISODate: string
): Promise<TripHistoryData> {
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", studentId)
    .single();
  if (studentError) throw studentError;

  const [schoolRes, attendanceRes, checkInRes] = await Promise.all([
    supabase.from("schools").select("timezone").eq("id", student.school_id).single(),
    supabase
      .from("attendance_expectations")
      .select("trip_id, status, trips!inner(trip_date, direction, status)")
      .eq("student_id", studentId)
      .gte("trips.trip_date", sinceISODate),
    supabase
      .from("check_in_events")
      .select("trip_id, event_type, occurred_at, stops(name, scheduled_time), trips!inner(trip_date)")
      .eq("student_id", studentId)
      .gte("trips.trip_date", sinceISODate)
  ]);
  if (schoolRes.error) throw schoolRes.error;
  if (attendanceRes.error) throw attendanceRes.error;
  if (checkInRes.error) throw checkInRes.error;

  const attendance = (
    attendanceRes.data as unknown as {
      trip_id: string;
      status: string;
      trips: { trip_date: string; direction: "pickup" | "dropoff"; status: string } | null;
    }[]
  )
    .filter((a) => a.trips !== null)
    .map((a) => ({
      trip_id: a.trip_id,
      status: a.status,
      trip_date: a.trips!.trip_date,
      direction: a.trips!.direction,
      trip_status: a.trips!.status
    }));

  const checkIns = (
    checkInRes.data as unknown as {
      trip_id: string;
      event_type: "board" | "alight";
      occurred_at: string;
      stops: { name: string; scheduled_time: string | null } | null;
      trips: { trip_date: string } | null;
    }[]
  )
    .filter((c) => c.trips !== null)
    .map((c) => ({
      trip_id: c.trip_id,
      event_type: c.event_type,
      occurred_at: c.occurred_at,
      stop_name: c.stops?.name ?? null,
      scheduled_time: c.stops?.scheduled_time ?? null
    }));

  return { attendance, checkIns, timeZone: schoolRes.data.timezone };
}
