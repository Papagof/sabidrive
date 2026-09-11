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

// Effectively indefinite -- Supabase's ban API takes a duration, not a flag.
// Same value/reasoning as apps/admin/src/app/api/deactivate-driver/route.ts.
const BAN_DURATION = "87600h";

interface DeactivateBody {
  schoolId?: string;
  deactivate?: boolean;
}

/**
 * Whole-school reversible lockout for platform operators -- mirrors
 * deactivate-driver's exact shape (ban via Supabase Auth + a marker column +
 * an audit_log row), but bans every account at the school (admins, drivers,
 * and parents alike), not just one driver, and is authorized via the
 * DEVELOPER_EMAILS allowlist rather than a profiles.role check, same as
 * developer/schools/route.ts.
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

  let body: DeactivateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { schoolId, deactivate } = body;
  if (!schoolId || typeof deactivate !== "boolean") {
    return NextResponse.json({ error: "schoolId and deactivate (boolean) are required" }, { status: 400 });
  }

  const { data: school, error: schoolError } = await serviceClient.from("schools").select("id").eq("id", schoolId).single();
  if (schoolError || !school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  const { data: members, error: membersError } = await serviceClient.from("profiles").select("id").eq("school_id", schoolId);
  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  for (const member of members ?? []) {
    const { error: banError } = await serviceClient.auth.admin.updateUserById(member.id, {
      ban_duration: deactivate ? BAN_DURATION : "none"
    });
    if (banError) {
      return NextResponse.json({ error: banError.message }, { status: 400 });
    }
  }

  const { error: updateError } = await serviceClient
    .from("schools")
    .update({ deactivated_at: deactivate ? new Date().toISOString() : null })
    .eq("id", schoolId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // The developer may have no profiles row -- actor_id is nullable
  // (0041_audit_log.sql), so this logs cleanly either way; the real email is
  // always captured in details so the record stays legible.
  const { data: callerProfile } = await serviceClient.from("profiles").select("id").eq("id", caller.id).maybeSingle();
  await serviceClient.from("audit_log").insert({
    school_id: schoolId,
    actor_id: callerProfile?.id ?? null,
    action: deactivate ? "school_deactivated" : "school_reactivated",
    target_id: schoolId,
    details: { by_email: callerEmail }
  });

  return NextResponse.json({ ok: true });
}
