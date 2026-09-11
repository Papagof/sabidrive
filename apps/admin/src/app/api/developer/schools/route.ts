import { NextResponse } from "next/server";
import { verifyDeveloperCaller } from "@/lib/developerAuth";

// Node runtime (not edge) -- needs the service-role key, same as every
// other privileged Route Handler in this app.
export const runtime = "nodejs";

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
  const auth = await verifyDeveloperCaller(req);
  if (!auth.ok) return auth.response;
  const { serviceClient } = auth;

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
