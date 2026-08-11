import type { TripmeSupabaseClient } from "../client";

export async function getSchoolRoutes(supabase: TripmeSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("routes")
    .select("*, stops(*)")
    .eq("school_id", schoolId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function getSchoolBuses(supabase: TripmeSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("buses")
    .select("*, driver:driver_id(id, full_name, verification_status), routes:default_route_id(id, name)")
    .eq("school_id", schoolId)
    .order("label");
  if (error) throw error;
  return data;
}

export type VerificationStatus = "pending" | "verified" | "rejected";

export async function setDriverVerification(supabase: TripmeSupabaseClient, driverId: string, status: VerificationStatus) {
  const { error } = await supabase.from("profiles").update({ verification_status: status }).eq("id", driverId);
  if (error) throw error;
}

export async function getSchoolStudents(supabase: TripmeSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("students")
    .select("*, guardian_student_links(guardian_id, profiles:guardian_id(full_name))")
    .eq("school_id", schoolId)
    .order("last_name");
  if (error) throw error;
  return data;
}

export async function getSchoolAlerts(supabase: TripmeSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function resolveAlert(supabase: TripmeSupabaseClient, alertId: string, resolvedBy: string, notes?: string) {
  const { error } = await supabase
    .from("alerts")
    .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy, ...(notes ? { notes } : {}) })
    .eq("id", alertId);
  if (error) throw error;
}

export async function assignAlertToSelf(supabase: TripmeSupabaseClient, alertId: string, adminId: string) {
  const { error } = await supabase.from("alerts").update({ assigned_to: adminId }).eq("id", alertId);
  if (error) throw error;
}

export interface CreateRouteInput {
  school_id: string;
  name: string;
  direction: "pickup" | "dropoff";
  polyline: { lat: number; lng: number }[];
}

export async function createRoute(supabase: TripmeSupabaseClient, input: CreateRouteInput) {
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

export async function createStop(supabase: TripmeSupabaseClient, input: CreateStopInput) {
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
  default_route_id?: string | null;
}

export async function createBus(supabase: TripmeSupabaseClient, input: CreateBusInput) {
  const { data, error } = await supabase.from("buses").insert(input).select().single();
  if (error) throw error;
  return data;
}

export interface CreateStudentInput {
  school_id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  default_route_id?: string | null;
  default_stop_id?: string | null;
}

export async function createStudent(supabase: TripmeSupabaseClient, input: CreateStudentInput) {
  const { data, error } = await supabase.from("students").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function getPickupOverrides(supabase: TripmeSupabaseClient, studentId: string) {
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

export async function createPickupOverride(supabase: TripmeSupabaseClient, input: CreatePickupOverrideInput) {
  const { error } = await supabase.from("pickup_overrides").insert(input);
  if (error) throw error;
}

export async function getSchoolAnnouncements(supabase: TripmeSupabaseClient, schoolId: string) {
  const { data, error } = await supabase
    .from("announcements")
    .select("*, profiles:created_by(full_name)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createAnnouncement(supabase: TripmeSupabaseClient, title: string, body: string) {
  const { error } = await supabase.rpc("create_announcement", { p_title: title, p_body: body });
  if (error) throw error;
}

export async function getSmsOutbox(supabase: TripmeSupabaseClient) {
  const { data, error } = await supabase
    .from("sms_outbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function getSchool(supabase: TripmeSupabaseClient, schoolId: string) {
  const { data, error } = await supabase.from("schools").select("*").eq("id", schoolId).single();
  if (error) throw error;
  return data;
}

export interface UpdateSchoolInput {
  name?: string;
  timezone?: string;
  geofence_lat?: number | null;
  geofence_lng?: number | null;
  geofence_radius_m?: number;
}

export async function updateSchool(supabase: TripmeSupabaseClient, schoolId: string, input: UpdateSchoolInput) {
  const { error } = await supabase.from("schools").update(input).eq("id", schoolId);
  if (error) throw error;
}

export async function linkGuardianToStudent(
  supabase: TripmeSupabaseClient,
  guardianId: string,
  studentId: string,
  relationship = "parent"
) {
  const { error } = await supabase
    .from("guardian_student_links")
    .insert({ guardian_id: guardianId, student_id: studentId, relationship, is_primary: true, is_authorized_pickup: true });
  if (error) throw error;
}
