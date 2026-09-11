import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient, getUserFromAccessToken } from "@sabidrive/supabase/server";

// Node runtime (not edge) -- needs the service-role key and the Admin API.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEVELOPER_EMAILS = (process.env.DEVELOPER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend's own no-verification-required sending address -- works for
// arbitrary recipients with zero domain setup, same "works fine without
// extra setup" framing already used for Twilio's trial account. Override
// once/if a real domain is verified with Resend.
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "SabiDrive <onboarding@resend.dev>";

interface MessageBody {
  schoolId?: string;
  subject?: string;
  body?: string;
}

/**
 * Lets a platform developer email a school's original signup admin directly
 * -- no real email-sending capability existed anywhere in this codebase
 * before this (confirmed by grep; the closest precedent, sms_outbox, is
 * explicitly simulated). Sends via Resend's plain REST API, no SDK
 * dependency, same "call the provider's HTTP API directly with fetch"
 * pattern already used for Twilio (apps/family/src/app/api/phone/send-otp).
 * Authorized via the DEVELOPER_EMAILS allowlist, same as every other
 * developer-only route in this app.
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

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerUser } = await serviceClient.auth.admin.getUserById(caller.id);
  const callerEmail = callerUser.user?.email?.toLowerCase();
  if (!callerEmail || !DEVELOPER_EMAILS.includes(callerEmail)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: MessageBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { schoolId, subject, body: messageBody } = body;
  if (!schoolId || !subject?.trim() || !messageBody?.trim()) {
    return NextResponse.json({ error: "schoolId, subject, and body are all required" }, { status: 400 });
  }

  // The school's original signup admin -- profiles.email is already the
  // denormalized, kept-in-sync mirror of auth.users.email (0019), so no
  // extra Admin API call is needed to resolve it.
  const { data: admin, error: adminError } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("school_id", schoolId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (adminError) {
    return NextResponse.json({ error: adminError.message }, { status: 500 });
  }
  if (!admin?.email) {
    return NextResponse.json({ error: "No admin account found for this school" }, { status: 404 });
  }

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "Email sending is not configured" }, { status: 503 });
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: admin.email,
      subject,
      text: messageBody
    })
  });
  const resendBody = await resendResponse.json().catch(() => ({}));

  await serviceClient.from("developer_messages").insert({
    school_id: schoolId,
    sender_email: callerEmail,
    recipient_email: admin.email,
    subject,
    body: messageBody,
    resend_message_id: resendResponse.ok ? (resendBody.id ?? null) : null,
    status: resendResponse.ok ? "sent" : "failed"
  });

  if (!resendResponse.ok) {
    return NextResponse.json({ error: resendBody.message ?? "Failed to send email" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
