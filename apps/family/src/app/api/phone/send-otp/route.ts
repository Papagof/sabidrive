import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient, getUserFromAccessToken } from "@sabidrive/supabase/server";

// Node runtime (not edge) — needs the service-role key.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

interface SendOtpBody {
  phone?: string;
}

/**
 * Sends a real SMS one-time code via Twilio Verify to verify a parent/
 * driver's phone number. Twilio owns code generation, expiry, and
 * attempt-limiting -- we only stage the phone number and, once verify-otp
 * confirms it, flip profiles.phone_verified. `profiles.phone` is staged
 * here (unverified) rather than editable through a generic profile update --
 * the `protect_phone_verified` trigger (0021_phone_verification.sql) blocks
 * any client from setting phone/phone_verified directly, so this
 * service-role write is the only way a phone number ever changes.
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

  let body: SendOtpBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  if (!phone || !PHONE_PATTERN.test(phone)) {
    return NextResponse.json({ error: "Enter a phone number in international format, e.g. +15551234567" }, { status: 400 });
  }

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error: phoneUpdateError } = await serviceClient
    .from("profiles")
    .update({ phone, phone_verified: false })
    .eq("id", caller.id);

  if (phoneUpdateError) {
    // Most likely the unique index -- someone else already verified this number.
    return NextResponse.json({ error: "That phone number is already in use" }, { status: 409 });
  }

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

  return NextResponse.json({ ok: true });
}
