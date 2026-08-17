import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient, getUserFromAccessToken } from "@tripme/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

interface VerifyOtpBody {
  code?: string;
}

/** Confirms the most recent SMS code sent to this user and flips profiles.phone_verified. */
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

  const { data: otpRow, error: fetchError } = await serviceClient
    .from("phone_otp_codes")
    .select("id, phone, code_hash, expires_at, attempts")
    .eq("user_id", caller.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !otpRow) {
    return NextResponse.json({ error: "Request a new code first" }, { status: 400 });
  }

  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "That code has expired — request a new one" }, { status: 400 });
  }

  if (otpRow.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many attempts — request a new code" }, { status: 429 });
  }

  if (hashCode(code) !== otpRow.code_hash) {
    await serviceClient
      .from("phone_otp_codes")
      .update({ attempts: otpRow.attempts + 1 })
      .eq("id", otpRow.id);
    return NextResponse.json({ error: "Incorrect code" }, { status: 400 });
  }

  const { error: updateError } = await serviceClient.from("profiles").update({ phone_verified: true }).eq("id", caller.id);
  if (updateError) {
    return NextResponse.json({ error: "Failed to verify phone number" }, { status: 500 });
  }

  await serviceClient.from("phone_otp_codes").delete().eq("id", otpRow.id);

  return NextResponse.json({ ok: true, phone: otpRow.phone });
}
