import { NextResponse } from "next/server";
import {
  createAnonServerSupabaseClient,
  createServiceRoleSupabaseClient,
  createUserScopedServerSupabaseClient,
  getUserFromAccessToken
} from "@sabidrive/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

interface VerifyCodeBody {
  tripId?: string;
  eventType?: "board" | "alight";
  code?: string;
}

interface CandidateRow {
  id: string;
  student_id: string;
  guardian_id: string;
  phone: string;
}

/**
 * Called from the driver's Scan screen when they type in a parent-supplied
 * SMS code instead of scanning a QR (0026_pickup_sms_codes.sql). We don't
 * know up front which student a bare 6-digit code belongs to, so we narrow
 * to students expected on *this* trip with a matching pending pickup_codes
 * row, then ask Twilio to check the code against each candidate's phone --
 * roster sizes are small (a single bus manifest), so this stays cheap.
 */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const anonClient = createAnonServerSupabaseClient(SUPABASE_URL, ANON_KEY);
  const caller = await getUserFromAccessToken(anonClient, token);
  if (!caller) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  let body: VerifyCodeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tripId = body.tripId?.trim();
  const eventType = body.eventType;
  const code = body.code?.trim();
  if (!tripId || (eventType !== "board" && eventType !== "alight") || !code) {
    return NextResponse.json({ error: "tripId, eventType, and code are required" }, { status: 400 });
  }

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: trip, error: tripError } = await serviceClient
    .from("trips")
    .select("id, driver_id, status")
    .eq("id", tripId)
    .maybeSingle();
  if (tripError || !trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  if (trip.driver_id !== caller.id) {
    return NextResponse.json({ error: "Not authorized to check in students on this trip" }, { status: 403 });
  }
  if (trip.status !== "in_progress") {
    return NextResponse.json({ error: "Trip is not in progress" }, { status: 400 });
  }

  const { data: expectations, error: expectationsError } = await serviceClient
    .from("attendance_expectations")
    .select("student_id")
    .eq("trip_id", tripId);
  if (expectationsError) {
    return NextResponse.json({ error: "Failed to load trip roster" }, { status: 500 });
  }
  const expectedStudentIds = (expectations ?? []).map((e) => e.student_id as string);
  if (expectedStudentIds.length === 0) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  const { data: candidates, error: candidatesError } = await serviceClient
    .from("pickup_codes")
    .select("id, student_id, guardian_id, phone")
    .in("student_id", expectedStudentIds)
    .eq("event_type", eventType)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (candidatesError) {
    return NextResponse.json({ error: "Failed to look up pending codes" }, { status: 500 });
  }

  let matched: CandidateRow | null = null;
  for (const candidate of (candidates ?? []) as CandidateRow[]) {
    const twilioResponse = await fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ To: candidate.phone, Code: code })
    });
    if (!twilioResponse.ok) continue;
    const twilioBody = await twilioResponse.json();
    if (twilioBody.status === "approved") {
      matched = candidate;
      break;
    }
  }

  if (!matched) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  const { data: student, error: studentError } = await serviceClient
    .from("students")
    .select("first_name, last_name, qr_token")
    .eq("id", matched.student_id)
    .single();
  if (studentError || !student) {
    return NextResponse.json({ error: "Student not found" }, { status: 500 });
  }

  const userClient = createUserScopedServerSupabaseClient(SUPABASE_URL, ANON_KEY, token);
  const { error: checkInError } = await userClient.rpc("check_in", {
    p_trip_id: tripId,
    p_qr_token: student.qr_token,
    p_event_type: eventType,
    p_method: "sms_code"
  });
  if (checkInError) {
    return NextResponse.json({ error: checkInError.message }, { status: 400 });
  }

  await serviceClient
    .from("pickup_codes")
    .update({ status: "consumed", consumed_at: new Date().toISOString(), consumed_trip_id: tripId })
    .eq("id", matched.id);

  const { data: guardian } = await serviceClient.from("profiles").select("full_name").eq("id", matched.guardian_id).maybeSingle();

  return NextResponse.json({
    ok: true,
    studentName: `${student.first_name} ${student.last_name}`,
    guardianName: guardian?.full_name ?? null
  });
}
