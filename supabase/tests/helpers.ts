/**
 * Shared fixtures for the DB/RLS/RPC integration suite. These hit the real
 * (production) Supabase project over REST -- there is no separate test
 * project, so every test must create its own disposable school/users and
 * clean them up itself (school before users, since school deletion cascades
 * away everything else and announcements.created_by would otherwise block
 * user deletion first -- the same ordering bug hit during the full-database
 * wipe earlier this project).
 *
 * Credentials are read from environment variables only, never hardcoded --
 * this file is committed to the repo, unlike the scratchpad scripts this
 * suite was ported from.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";

config({ path: resolve(__dirname, "../../.env.local") });

export const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** Only needed by grant_lockdown.test.ts (direct `has_function_privilege` check) -- optional here so the rest of the suite works without it. */
export const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local at repo root."
  );
}

export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  body: T;
}

async function request(url: string, apikey: string, token: string, opts: RequestInit = {}): Promise<ApiResult> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      apikey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {})
    }
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, body };
}

/** Service-role call -- bypasses RLS. Use only for test setup/teardown, never as a stand-in for a real auth check. */
export function svc(path: string, opts: RequestInit = {}): Promise<ApiResult> {
  return request(`${SUPABASE_URL}${path}`, SERVICE_ROLE_KEY!, SERVICE_ROLE_KEY!, opts);
}

/** Call as a specific signed-in user -- this is what actually exercises RLS/RPC authorization. */
export function asUser(token: string, path: string, opts: RequestInit = {}): Promise<ApiResult> {
  return request(`${SUPABASE_URL}${path}`, ANON_KEY!, token, opts);
}

export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export async function createUser(
  email: string,
  password: string,
  metadata: Record<string, unknown>
): Promise<string> {
  const r = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata })
  });
  if (!r.ok) throw new Error(`createUser(${email}) failed: ${JSON.stringify(r.body)}`);
  return r.body.id as string;
}

export async function deleteUser(userId: string): Promise<void> {
  await svc(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
}

export async function setProfileSchool(userId: string, schoolId: string): Promise<void> {
  const r = await svc(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ school_id: schoolId })
  });
  if (!r.ok) throw new Error(`setProfileSchool(${userId}) failed: ${JSON.stringify(r.body)}`);
}

export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`signIn(${email}) failed: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

/**
 * A real signed-in @sabidrive/supabase client (not the raw-fetch helpers
 * above) -- for tests that need to call the actual typed query functions in
 * packages/supabase/src/queries/*.ts directly, so a bug in the real query
 * string/embed isn't masked by a hand-written REST call re-implementing it.
 */
export async function signInClient(email: string, password: string): Promise<SabiDriveSupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client as SabiDriveSupabaseClient;
}

export async function createSchool(name: string): Promise<string> {
  const r = await svc("/rest/v1/schools", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name, timezone: "Africa/Lagos" })
  });
  if (!r.ok) throw new Error(`createSchool(${name}) failed: ${JSON.stringify(r.body)}`);
  return r.body[0].id as string;
}

/** Deletes a disposable school -- cascades trips/buses/routes/students/attendance/notifications/alerts. */
export async function deleteSchool(schoolId: string): Promise<void> {
  await svc(`/rest/v1/schools?id=eq.${schoolId}`, { method: "DELETE" });
}

export async function createRoute(schoolId: string, name: string): Promise<string> {
  const r = await svc("/rest/v1/routes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      school_id: schoolId,
      name,
      direction: "pickup",
      polyline: [
        { lat: 6.5, lng: 3.3 },
        { lat: 6.51, lng: 3.31 }
      ]
    })
  });
  if (!r.ok) throw new Error(`createRoute(${name}) failed: ${JSON.stringify(r.body)}`);
  return r.body[0].id as string;
}

export async function createBus(schoolId: string, label: string, driverId: string, routeId: string): Promise<string> {
  const r = await svc("/rest/v1/buses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ school_id: schoolId, label, driver_id: driverId, default_route_id: routeId })
  });
  if (!r.ok) throw new Error(`createBus(${label}) failed: ${JSON.stringify(r.body)}`);
  return r.body[0].id as string;
}

export async function createStudent(
  schoolId: string,
  firstName: string,
  lastName: string,
  routeId: string
): Promise<{ id: string; qrToken: string }> {
  const r = await svc("/rest/v1/students", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ school_id: schoolId, first_name: firstName, last_name: lastName, default_route_id: routeId })
  });
  if (!r.ok) throw new Error(`createStudent(${firstName}) failed: ${JSON.stringify(r.body)}`);
  return { id: r.body[0].id as string, qrToken: r.body[0].qr_token as string };
}

export async function linkGuardian(guardianId: string, studentId: string): Promise<void> {
  const r = await svc("/rest/v1/guardian_student_links", {
    method: "POST",
    body: JSON.stringify({ guardian_id: guardianId, student_id: studentId })
  });
  if (!r.ok) throw new Error(`linkGuardian(${guardianId}, ${studentId}) failed: ${JSON.stringify(r.body)}`);
}

/** Direct service-role insert -- for seeding report-fetcher test fixtures only; real trips are normally only ever created via start_trip(). */
export async function createTripDirect(input: {
  schoolId: string;
  busId: string;
  routeId: string;
  driverId: string;
  status: "completed" | "cancelled" | "in_progress";
  tripDate: string;
  startedAt?: string;
  endedAt?: string;
}): Promise<string> {
  const r = await svc("/rest/v1/trips", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      school_id: input.schoolId,
      bus_id: input.busId,
      route_id: input.routeId,
      driver_id: input.driverId,
      status: input.status,
      direction: "pickup",
      trip_date: input.tripDate,
      started_at: input.startedAt ?? null,
      ended_at: input.endedAt ?? null
    })
  });
  if (!r.ok) throw new Error(`createTripDirect failed: ${JSON.stringify(r.body)}`);
  return r.body[0].id as string;
}

export async function createAttendanceDirect(tripId: string, studentId: string, status: string): Promise<void> {
  const r = await svc("/rest/v1/attendance_expectations", {
    method: "POST",
    body: JSON.stringify({ trip_id: tripId, student_id: studentId, status })
  });
  if (!r.ok) throw new Error(`createAttendanceDirect failed: ${JSON.stringify(r.body)}`);
}

export async function createStop(
  schoolId: string,
  routeId: string,
  name: string,
  sequenceNo: number,
  scheduledTime: string | null = "08:00:00"
): Promise<string> {
  const r = await svc("/rest/v1/stops", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      school_id: schoolId,
      route_id: routeId,
      name,
      sequence_no: sequenceNo,
      lat: 6.5,
      lng: 3.3,
      scheduled_time: scheduledTime
    })
  });
  if (!r.ok) throw new Error(`createStop(${name}) failed: ${JSON.stringify(r.body)}`);
  return r.body[0].id as string;
}

/** Direct service-role insert -- for seeding report-fetcher test fixtures only; real check-ins are normally only ever created via check_in(). */
export async function createCheckInEventDirect(input: {
  tripId: string;
  studentId: string;
  stopId: string;
  eventType: "board" | "alight";
  occurredAt: string;
}): Promise<void> {
  const r = await svc("/rest/v1/check_in_events", {
    method: "POST",
    body: JSON.stringify({
      trip_id: input.tripId,
      student_id: input.studentId,
      stop_id: input.stopId,
      event_type: input.eventType,
      method: "qr",
      occurred_at: input.occurredAt
    })
  });
  if (!r.ok) throw new Error(`createCheckInEventDirect failed: ${JSON.stringify(r.body)}`);
}

export async function createAlertDirect(input: {
  schoolId: string;
  tripId: string;
  type: string;
  severity: "info" | "warning" | "critical";
  resolvedAt?: string;
}): Promise<void> {
  const r = await svc("/rest/v1/alerts", {
    method: "POST",
    body: JSON.stringify({
      school_id: input.schoolId,
      trip_id: input.tripId,
      type: input.type,
      severity: input.severity,
      resolved_at: input.resolvedAt ?? null
    })
  });
  if (!r.ok) throw new Error(`createAlertDirect failed: ${JSON.stringify(r.body)}`);
}
