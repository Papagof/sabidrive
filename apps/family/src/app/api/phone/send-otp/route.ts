import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient, getUserFromAccessToken } from "@tripme/supabase/server";

// Node runtime (not edge) — needs the service-role key and Node's crypto module.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER!;

const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

interface SendOtpBody {
  phone?: string;
}

/**
 * Sends a real SMS one-time code via Twilio to verify a parent/driver's
 * phone number. `profiles.phone` is staged here (unverified) rather than
 * editable through a generic profile update -- the `protect_phone_verified`
 * trigger (0021_phone_verification.sql) blocks any client from setting
 * phone/phone_verified directly, so this service-role write is the only way
 * a phone number ever changes.
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

  const { data: recent } = await serviceClient
    .from("phone_otp_codes")
    .select("created_at")
    .eq("user_id", caller.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent && Date.now() - new Date(recent.created_at).getTime() < OTP_COOLDOWN_MS) {
    return NextResponse.json({ error: "Please wait a minute before requesting another code" }, { status: 429 });
  }

  const { error: phoneUpdateError } = await serviceClient
    .from("profiles")
    .update({ phone, phone_verified: false })
    .eq("id", caller.id);

  if (phoneUpdateError) {
    // Most likely the unique index -- someone else already verified this number.
    return NextResponse.json({ error: "That phone number is already in use" }, { status: 409 });
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

  const { error: insertError } = await serviceClient.from("phone_otp_codes").insert({
    user_id: caller.id,
    phone,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString()
  });
  if (insertError) {
    return NextResponse.json({ error: "Failed to generate a verification code" }, { status: 500 });
  }

  const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      To: phone,
      From: TWILIO_FROM_NUMBER,
      Body: `Your Tripme verification code is ${code}. It expires in 10 minutes.`
    })
  });

  if (!twilioResponse.ok) {
    const detail = await twilioResponse.text();
    return NextResponse.json({ error: `Failed to send SMS: ${detail}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
