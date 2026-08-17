import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient, getUserFromAccessToken } from "@tripme/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

interface VerifyOtpBody {
  code?: string;
}

/** Confirms the code Twilio Verify sent to this user's staged phone number and flips profiles.phone_verified. */
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

  let body: VerifyOtpBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "Enter the code you were sent" }, { status: 400 });
  }

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profileRow, error: profileError } = await serviceClient
    .from("profiles")
    .select("phone")
    .eq("id", caller.id)
    .maybeSingle();

  if (profileError || !profileRow?.phone) {
    return NextResponse.json({ error: "Request a new code first" }, { status: 400 });
  }

  const twilioResponse = await fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: profileRow.phone, Code: code })
  });

  const twilioBody = await twilioResponse.json();
  if (!twilioResponse.ok || twilioBody.status !== "approved") {
    return NextResponse.json({ error: "Incorrect or expired code" }, { status: 400 });
  }

  const { error: updateError } = await serviceClient.from("profiles").update({ phone_verified: true }).eq("id", caller.id);
  if (updateError) {
    return NextResponse.json({ error: "Failed to verify phone number" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone: profileRow.phone });
}
