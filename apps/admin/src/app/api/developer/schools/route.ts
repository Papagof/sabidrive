import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient, getUserFromAccessToken } from "@sabidrive/supabase/server";

// Node runtime (not edge) -- needs the service-role key, same as every
// other privileged Route Handler in this app.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEVELOPER_EMAILS = (process.env.DEVELOPER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Cross-school view for platform operators -- deliberately not a new
 * `profiles.role` value or RLS policy (a developer might have no profile
 * row at all, and that would mean teaching every RLS-scoped query in the
 * schema about a role that can see everything, a much bigger surface than
 * one audited route). Authorization is a hardcoded email allowlist checked
 * here, same "verify caller identity via bearer token, then apply a
 * narrower rule than 'any authenticated user'" shape as invite-user /
 * find-guardian-by-email, just with an env-var allowlist instead of a
 * profiles.role check.
 */
export async function GET(req: Request) {
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

  // Looked up via the Admin API against auth.users directly, not `profiles`
  // -- a developer account may have no profiles row at all, so this can't
  // depend on one existing.
  const { data: callerUser } = await serviceClient.auth.admin.getUserById(caller.id);
  const callerEmail = callerUser.user?.email?.toLowerCase();
  if (!callerEmail || !DEVELOPER_EMAILS.includes(callerEmail)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const [schoolsResult, studentsResult, busesResult] = await Promise.all([
    serviceClient.from("schools").select("*").order("created_at", { ascending: false }),
    serviceClient.from("students").select("school_id"),
    serviceClient.from("buses").select("school_id")
  ]);

  if (schoolsResult.error) {
    return NextResponse.json({ error: schoolsResult.error.message }, { status: 500 });
  }

  const studentCounts: Record<string, number> = {};
  for (const row of studentsResult.data ?? []) {
    studentCounts[row.school_id] = (studentCounts[row.school_id] ?? 0) + 1;
  }
  const busCounts: Record<string, number> = {};
  for (const row of busesResult.data ?? []) {
    busCounts[row.school_id] = (busCounts[row.school_id] ?? 0) + 1;
  }

  const schools = (schoolsResult.data ?? []).map((school) => ({
    ...school,
    studentCount: studentCounts[school.id] ?? 0,
    busCount: busCounts[school.id] ?? 0
  }));

  return NextResponse.json({ schools });
}
