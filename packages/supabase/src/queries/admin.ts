import type { SabiDriveSupabaseClient } from "../client";

export async function getSchoolRoutes(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("routes")
    .select("*, stops(*)")
    .eq("school_id", schoolId)
    .order("name");
  if (error) throw error;
  return data;
}

/** Thrown by deleteRoute specifically when the route has trip history -- lets the UI explain why, instead of a raw error. */
export class RouteHasTripHistoryError extends Error {
  constructor() {
    super("This route has trip history and can't be deleted.");
    this.name = "RouteHasTripHistoryError";
  }
}

/**
 * Deletes a route that's no longer in use. trips.route_id has no ON DELETE
 * cascade/set-null (same RESTRICT-by-default protection as trips.bus_id,
 * 0029_bus_deletion.sql), so a route that ever had a trip run on it fails
 * with a foreign-key violation (23503) instead of losing that history.
 * Deleting also cascades away the route's own stops (they have no meaning
 * without it) and clears default_route_id on any bus/student still
 * pointing at it, rather than blocking on that -- those are just
 * assignment pointers, not history.
 */
export async function deleteRoute(supabase: SabiDriveSupabaseClient, routeId: string) {
  const { error } = await supabase.from("routes").delete().eq("id", routeId);
  if (error) {
    if (error.code === "23503") {
      throw new RouteHasTripHistoryError();
    }
    throw error;
  }
}

export async function getSchoolBuses(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("buses")
    .select(
      "*, driver:driver_id(id, full_name, verification_status), attendant:attendant_id(id, full_name), routes:default_route_id(id, name)"
    )
    .eq("school_id", schoolId)
    .order("label");
  if (error) throw error;
  return data;
}

export type VerificationStatus = "pending" | "verified" | "rejected";

export async function setDriverVerification(supabase: SabiDriveSupabaseClient, driverId: string, status: VerificationStatus) {
  const { error } = await supabase.from("profiles").update({ verification_status: status }).eq("id", driverId);
  if (error) throw error;
}

interface StaffRow {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  verification_status: string | null;
  deactivated_at: string | null;
}

/**
 * Admins/drivers belong to exactly one school, so a direct school_id filter
 * is enough for them. Guardians are different -- a guardian can be linked
 * to a student at a school other than the one their own account was first
 * invited into (0024_cross_role_guardians.sql), so a same-school-only
 * filter would miss them even though they're now RLS-visible
 * (profiles_select_admin_of_linked_student). Union same-school parents
 * with guardian_student_links-linked guardians of this school's students,
 * deduped by id.
 */
export async function getSchoolStaffAndGuardians(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const [staffResult, sameSchoolGuardiansResult, linkedGuardiansResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, verification_status, deactivated_at").eq("school_id", schoolId).in("role", ["admin", "driver"]),
    supabase.from("profiles").select("id, full_name, email, role, verification_status, deactivated_at").eq("school_id", schoolId).eq("role", "parent"),
    supabase
      .from("students")
      .select("guardian_student_links(profiles:guardian_id(id, full_name, email, role, verification_status, deactivated_at))")
      .eq("school_id", schoolId)
  ]);
  if (staffResult.error) throw staffResult.error;
  if (sameSchoolGuardiansResult.error) throw sameSchoolGuardiansResult.error;
  if (linkedGuardiansResult.error) throw linkedGuardiansResult.error;

  const linkedGuardians = (
    linkedGuardiansResult.data as unknown as { guardian_student_links: { profiles: StaffRow | null }[] }[]
  ).flatMap((s) => s.guardian_student_links.map((l) => l.profiles).filter((p): p is StaffRow => p !== null));

  const byId = new Map<string, StaffRow>();
  for (const row of [...(staffResult.data as StaffRow[]), ...(sameSchoolGuardiansResult.data as StaffRow[]), ...linkedGuardians]) {
    byId.set(row.id, row);
  }

  const data = Array.from(byId.values()).sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name));
  return data;
}

export async function getSchoolStudents(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("students")
    .select("*, guardian_student_links(guardian_id, profiles:guardian_id(full_name))")
    .eq("school_id", schoolId)
    .order("last_name");
  if (error) throw error;
  return data;
}

export async function getSchoolAlerts(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// Sensitive admin actions (delete/retire a bus, delete a route, remove a
// guardian) are logged by security-definer triggers (0041_audit_log.sql), not
// by the client -- so this is a plain read, same shape as getSchoolAlerts.
export async function getAuditLog(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*, actor:actor_id(full_name)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function getOpenAlerts(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("alerts")
    .select("severity")
    .eq("school_id", schoolId)
    .is("resolved_at", null);
  if (error) throw error;
  return data as { severity: string }[];
}

export async function getTodaysAttendance(supabase: SabiDriveSupabaseClient, schoolId: string, todayISODate: string) {
  const { data, error } = await supabase
    .from("attendance_expectations")
    .select("status, trips!inner(school_id, trip_date)")
    .eq("trips.school_id", schoolId)
    .eq("trips.trip_date", todayISODate);
  if (error) throw error;
  return data as unknown as { status: string }[];
}

export async function resolveAlert(supabase: SabiDriveSupabaseClient, alertId: string, resolvedBy: string, notes?: string) {
  const { error } = await supabase
    .from("alerts")
    .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy, ...(notes ? { notes } : {}) })
    .eq("id", alertId);
  if (error) throw error;
}

export async function assignAlertToSelf(supabase: SabiDriveSupabaseClient, alertId: string, adminId: string) {
  const { error } = await supabase.from("alerts").update({ assigned_to: adminId }).eq("id", alertId);
  if (error) throw error;
}

export interface CreateRouteInput {
  school_id: string;
  name: string;
  direction: "pickup" | "dropoff";
  polyline: { lat: number; lng: number }[];
}

export async function createRoute(supabase: SabiDriveSupabaseClient, input: CreateRouteInput) {
  const { data, error } = await supabase.from("routes").insert(input).select().single();
  if (error) throw error;
  return data as unknown as CreateRouteInput & { id: string };
}

export interface CreateStopInput {
  route_id: string;
  school_id: string;
  name: string;
  sequence_no: number;
  lat: number;
  lng: number;
  radius_m?: number;
}

export async function createStop(supabase: SabiDriveSupabaseClient, input: CreateStopInput) {
  const { data, error } = await supabase.from("stops").insert(input).select().single();
  if (error) throw error;
  return data;
}

export interface CreateBusInput {
  school_id: string;
  label: string;
  license_plate?: string;
  capacity?: number;
  driver_id?: string | null;
  attendant_id?: string | null;
  default_route_id?: string | null;
}

export async function createBus(supabase: SabiDriveSupabaseClient, input: CreateBusInput) {
  const { data, error } = await supabase.from("buses").insert(input).select().single();
  if (error) throw error;
  return data;
}

export interface UpdateBusInput {
  label?: string;
  capacity?: number | null;
  driver_id?: string | null;
  attendant_id?: string | null;
  default_route_id?: string | null;
}

/** Lets an admin reassign a bus's driver and/or route after creation -- e.g. a bus created before its route existed. */
export async function updateBus(supabase: SabiDriveSupabaseClient, busId: string, input: UpdateBusInput) {
  const { error } = await supabase.from("buses").update(input).eq("id", busId);
  if (error) throw error;
}

/** Thrown by deleteBus specifically when the bus has trip history -- lets the UI offer "Retire instead" rather than just showing an error. */
export class BusHasTripHistoryError extends Error {
  constructor() {
    super("This bus has trip history and can't be deleted.");
    this.name = "BusHasTripHistoryError";
  }
}

/**
 * Deletes a bus that has never run a trip. trips.bus_id has no ON DELETE
 * cascade/set-null (0029_bus_deletion.sql, on purpose) so a bus with trip
 * history fails this with a foreign-key violation (Postgres code 23503)
 * instead of silently erasing that history -- surfaced as BusHasTripHistoryError
 * rather than a raw database error.
 */
export async function deleteBus(supabase: SabiDriveSupabaseClient, busId: string) {
  const { error } = await supabase.from("buses").delete().eq("id", busId);
  if (error) {
    if (error.code === "23503") {
      throw new BusHasTripHistoryError();
    }
    throw error;
  }
}

/**
 * Reversible alternative to deleteBus for a bus that has trip history and
 * so can't be hard-deleted: marks it retired (off the active Buses page)
 * and clears its current driver/route/attendant assignment, without
 * touching any trip/check-in/attendance record. "Restore" undoes it.
 */
export async function setBusRetired(supabase: SabiDriveSupabaseClient, busId: string, retired: boolean) {
  const { error } = await supabase
    .from("buses")
    .update(
      retired
        ? { retired_at: new Date().toISOString(), driver_id: null, attendant_id: null, default_route_id: null }
        : { retired_at: null }
    )
    .eq("id", busId);
  if (error) throw error;
}

export interface CreateStudentInput {
  school_id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  default_route_id?: string | null;
  default_stop_id?: string | null;
}

export async function createStudent(supabase: SabiDriveSupabaseClient, input: CreateStudentInput) {
  const { data, error } = await supabase.from("students").insert(input).select().single();
  if (error) throw error;
  return data;
}

/** Bulk CSV import -- students_admin_crud RLS is a plain row-level policy with no batch-size restriction, so a multi-row insert works as-is. */
export async function createStudentsBulk(supabase: SabiDriveSupabaseClient, inputs: CreateStudentInput[]) {
  const { data, error } = await supabase.from("students").insert(inputs).select();
  if (error) throw error;
  return data;
}

export async function getPickupOverrides(supabase: SabiDriveSupabaseClient, studentId: string) {
  const { data, error } = await supabase
    .from("pickup_overrides")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export interface CreatePickupOverrideInput {
  student_id: string;
  authorized_name: string;
  authorized_relationship?: string;
  notes?: string;
  created_by: string;
}

export async function createPickupOverride(supabase: SabiDriveSupabaseClient, input: CreatePickupOverrideInput) {
  const { error } = await supabase.from("pickup_overrides").insert(input);
  if (error) throw error;
}

export async function getSchoolAnnouncements(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("announcements")
    .select("*, profiles:created_by(full_name)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createAnnouncement(supabase: SabiDriveSupabaseClient, title: string, body: string) {
  const { error } = await supabase.rpc("create_announcement", { p_title: title, p_body: body });
  if (error) throw error;
}

export async function getSmsOutbox(supabase: SabiDriveSupabaseClient) {
  const { data, error } = await supabase
    .from("sms_outbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function getSchool(supabase: SabiDriveSupabaseClient, schoolId: string) {
  const { data, error } = await supabase.from("schools").select("*").eq("id", schoolId).single();
  if (error) throw error;
  return data;
}

export interface UpdateSchoolInput {
  name?: string;
  address?: string;
  timezone?: string;
  geofence_lat?: number | null;
  geofence_lng?: number | null;
  geofence_radius_m?: number;
  on_time_threshold_minutes?: number;
}

export async function updateSchool(supabase: SabiDriveSupabaseClient, schoolId: string, input: UpdateSchoolInput) {
  const { error } = await supabase.from("schools").update(input).eq("id", schoolId);
  if (error) throw error;
}

export async function linkGuardianToStudent(
  supabase: SabiDriveSupabaseClient,
  guardianId: string,
  studentId: string,
  relationship = "parent"
) {
  const { error } = await supabase
    .from("guardian_student_links")
    .insert({ guardian_id: guardianId, student_id: studentId, relationship, is_primary: true, is_authorized_pickup: true });
  if (error) throw error;
}

/**
 * Removes a guardian from every one of this school's students, without
 * touching their account or any guardian link they have at another school
 * -- "delete this parent" scoped to "my school", not their whole account.
 * `gsl_admin_crud` (0003_rls_policies.sql) already only lets an admin
 * delete guardian_student_links rows whose *student* is in their own
 * school, so a plain guardian_id-only delete is safe as-is: any links to
 * students at other schools simply don't match the policy and are left
 * untouched, not errored on.
 */
export async function removeGuardianFromSchool(supabase: SabiDriveSupabaseClient, guardianId: string) {
  const { error } = await supabase.from("guardian_student_links").delete().eq("guardian_id", guardianId);
  if (error) throw error;
}

// === Reports page range-scoped fetchers ===
// Raw rows only -- see reports.ts (packages/supabase/src/reports.ts) for the
// pure aggregation these feed. All admin-RLS-scoped like everything else in
// this file; no new migration/policy needed since trips/attendance_expectations/
// alerts/sms_outbox were already fully readable for an admin's own school.

export async function getTripsInRange(supabase: SabiDriveSupabaseClient, schoolId: string, sinceISODate: string) {
  const { data, error } = await supabase
    .from("trips")
    .select("status, route_id, started_at, ended_at, routes(name)")
    .eq("school_id", schoolId)
    .gte("trip_date", sinceISODate);
  if (error) throw error;
  return (data as unknown as { status: string; route_id: string; started_at: string | null; ended_at: string | null; routes: { name: string } | null }[]).map(
    (t) => ({ status: t.status, route_id: t.route_id, route_name: t.routes?.name ?? null, started_at: t.started_at, ended_at: t.ended_at })
  );
}

export async function getAttendanceInRange(supabase: SabiDriveSupabaseClient, schoolId: string, sinceISODate: string) {
  const { data, error } = await supabase
    .from("attendance_expectations")
    .select("status, trips!inner(school_id, trip_date)")
    .eq("trips.school_id", schoolId)
    .gte("trips.trip_date", sinceISODate);
  if (error) throw error;
  return data as unknown as { status: string }[];
}

export async function getAlertsInRange(supabase: SabiDriveSupabaseClient, schoolId: string, sinceISODate: string) {
  const { data, error } = await supabase
    .from("alerts")
    .select("type, severity, resolved_at, trips(driver_id, driver:driver_id(full_name))")
    .eq("school_id", schoolId)
    .gte("created_at", sinceISODate);
  if (error) throw error;
  return (
    data as unknown as {
      type: string;
      severity: string;
      resolved_at: string | null;
      trips: { driver_id: string; driver: { full_name: string } | null } | null;
    }[]
  ).map((a) => ({
    type: a.type,
    severity: a.severity,
    resolved_at: a.resolved_at,
    driver_id: a.trips?.driver_id ?? null,
    driver_name: a.trips?.driver?.full_name ?? null
  }));
}

export async function getSmsCountInRange(supabase: SabiDriveSupabaseClient, sinceISODate: string) {
  const { count, error } = await supabase
    .from("sms_outbox")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceISODate);
  if (error) throw error;
  return count ?? 0;
}

// Only check_in_events with a stop_id are usable for on-time comparison (a
// stop nobody boarded/alighted at that day has no actual-arrival signal).
export async function getOnTimeCheckInsInRange(supabase: SabiDriveSupabaseClient, schoolId: string, sinceISODate: string) {
  const { data, error } = await supabase
    .from("check_in_events")
    .select(
      "trip_id, event_type, occurred_at, stop_id, trips!inner(school_id, trip_date, direction, route_id, routes(name)), stops(scheduled_time)"
    )
    .eq("trips.school_id", schoolId)
    .gte("trips.trip_date", sinceISODate)
    .not("stop_id", "is", null);
  if (error) throw error;
  return (
    data as unknown as {
      trip_id: string;
      event_type: "board" | "alight";
      occurred_at: string;
      stop_id: string;
      trips: { trip_date: string; direction: "pickup" | "dropoff"; route_id: string; routes: { name: string } | null } | null;
      stops: { scheduled_time: string | null } | null;
    }[]
  )
    .filter((r) => r.trips !== null)
    .map((r) => ({
      trip_id: r.trip_id,
      event_type: r.event_type,
      occurred_at: r.occurred_at,
      stop_id: r.stop_id,
      trip_date: r.trips!.trip_date,
      direction: r.trips!.direction,
      route_id: r.trips!.route_id,
      route_name: r.trips!.routes?.name ?? null,
      scheduled_time: r.stops?.scheduled_time ?? null
    }));
}
