import type { SabiDriveSupabaseClient } from "../client";

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: "driver" | "parent" | "admin";
  phone?: string;
}

/**
 * Calls the admin app's `/api/invite-user` Route Handler (the one place
 * that's allowed to touch the Supabase service-role key) to invite a new
 * driver, parent, or co-admin by email.
 */
export async function inviteUser(supabase: SabiDriveSupabaseClient, input: InviteUserInput): Promise<{ userId: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const response = await fetch("/api/invite-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to invite user");
  }
  return body as { userId: string };
}

async function authedFetch(supabase: SabiDriveSupabaseClient, path: string, payload: unknown) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body;
}

/** Sends a real SMS one-time code to verify a phone number (calls the family app's /api/phone/send-otp). */
export async function sendPhoneOtp(supabase: SabiDriveSupabaseClient, phone: string): Promise<void> {
  await authedFetch(supabase, "/api/phone/send-otp", { phone });
}

/** Confirms the SMS code sent by sendPhoneOtp (calls /api/phone/verify-otp). */
export async function verifyPhoneOtp(supabase: SabiDriveSupabaseClient, code: string): Promise<void> {
  await authedFetch(supabase, "/api/phone/verify-otp", { code });
}

/**
 * Sends a real SMS one-time code to the signed-in guardian's verified phone,
 * authorizing a student's next home boarding or home drop-off (calls the
 * family app's /api/pickup-code/request). The driver enters this code on
 * the Scan screen instead of scanning the student's QR at that stop.
 */
export async function requestPickupCode(
  supabase: SabiDriveSupabaseClient,
  studentId: string,
  eventType: "board" | "alight"
): Promise<void> {
  await authedFetch(supabase, "/api/pickup-code/request", { studentId, eventType });
}

export interface VerifyPickupCodeResult {
  studentName: string;
  guardianName: string | null;
}

/**
 * Called from the driver's Scan screen with a parent-supplied SMS code
 * (calls /api/pickup-code/verify) -- resolves the code to a student on this
 * trip's roster and performs the board/alight check-in server-side.
 */
export async function verifyPickupCode(
  supabase: SabiDriveSupabaseClient,
  tripId: string,
  eventType: "board" | "alight",
  code: string
): Promise<VerifyPickupCodeResult> {
  return (await authedFetch(supabase, "/api/pickup-code/verify", { tripId, eventType, code })) as VerifyPickupCodeResult;
}

export interface GuardianLookupResult {
  found: boolean;
  id?: string;
  full_name?: string;
}

/**
 * Looks up an existing parent account by email regardless of which school
 * it belongs to (calls the admin app's /api/find-guardian-by-email) -- used
 * to attach a guardian whose other child is at a different school, rather
 * than trying to invite a duplicate account for an email that already
 * exists.
 */
export async function findGuardianByEmail(supabase: SabiDriveSupabaseClient, email: string): Promise<GuardianLookupResult> {
  return (await authedFetch(supabase, "/api/find-guardian-by-email", { email })) as GuardianLookupResult;
}

/**
 * Signs in with a verified phone number + password (calls the public
 * /api/login-with-phone route, which resolves phone -> email server-side
 * and never exposes the email to the client). Caller must pass the tokens
 * to supabase.auth.setSession() to actually hydrate the browser session.
 */
export async function loginWithPhone(phone: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
  const response = await fetch("/api/login-with-phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to sign in");
  }
  return body as { access_token: string; refresh_token: string };
}
