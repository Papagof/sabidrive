import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient, getUserFromAccessToken } from "@tripme/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

interface RequestCodeBody {
  studentId?: string;
  eventType?: "board" | "alight";
}

/**
 * Sends a real SMS one-time code (Twilio Verify) to a guardian's verified
 * phone, authorizing their child's next home boarding ('board') or home
 * drop-off ('alight') -- the driver enters this code on the Scan screen
 * instead of scanning the student's QR at that stop
 * (0026_pickup_sms_codes.sql). Twilio owns the code itself; this route only
 * records *who* it was sent to and *which student/event* it's meant to
 * authorize, so /api/pickup-code/verify can resolve a driver-submitted code
 * back to a student.
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

  let body: RequestCodeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const studentId = body.studentId?.trim();
  const eventType = body.eventType;
  if (!studentId || (eventType !== "board" && eventType !== "alight")) {
    return NextResponse.json({ error: "studentId and eventType ('board' or 'alight') are required" }, { status: 400 });
  }

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: link, error: linkError } = await serviceClient
    .from("guardian_student_links")
    .select("student_id")
    .eq("guardian_id", caller.id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (linkError) {
    return NextResponse.json({ error: "Failed to look up guardian link" }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json({ error: "Not a guardian of this student" }, { status: 403 });
  }

  const { data: guardianProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("phone, phone_verified")
    .eq("id", caller.id)
    .single();
  if (profileError || !guardianProfile?.phone || !guardianProfile.phone_verified) {
    return NextResponse.json({ error: "Verify your phone number first, from the Account page" }, { status: 400 });
  }
  const phone = guardianProfile.phone;

  // A new Verification for the same phone effectively supersedes any prior
  // pending one at Twilio, so keep our own pending rows for that phone in
  // sync -- otherwise /verify could match a code that no longer works.
  await serviceClient
    .from("pickup_codes")
    .update({ status: "expired" })
    .eq("phone", phone)
    .eq("event_type", eventType)
    .eq("status", "pending");

  const twilioResponse = await fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: phone, Channel: "sms" })
  });
  if (!twilioResponse.ok) {
    const detail = await twilioResponse.text();
    return NextResponse.json({ error: `Failed to send SMS: ${detail}` }, { status: 502 });
  }

  const { error: insertError } = await serviceClient.from("pickup_codes").insert({
    student_id: studentId,
    guardian_id: caller.id,
    event_type: eventType,
    phone
  });
  if (insertError) {
    return NextResponse.json({ error: "Failed to record pickup code request" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
