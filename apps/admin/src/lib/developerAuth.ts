import { NextResponse } from "next/server";
import {
  createAnonServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getUserFromAccessToken
} from "@sabidrive/supabase/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEVELOPER_EMAILS = (process.env.DEVELOPER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

type ServiceClient = ReturnType<typeof createServiceRoleSupabaseClient>;

type DeveloperCallerResult =
  | { ok: true; callerId: string; email: string; serviceClient: ServiceClient }
  | { ok: false; response: NextResponse };

/**
 * Shared bearer-token -> DEVELOPER_EMAILS-allowlist check, used by every
 * developer-only Route Handler. Extracted once this became the fourth
 * near-identical copy (schools GET, deactivate, message, the isDeveloper
 * check below) -- same "three similar things" threshold this project
 * already applied to packages/supabase/src/csv.ts.
 */
export async function verifyDeveloperCaller(req: Request): Promise<DeveloperCallerResult> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Missing Authorization header" }, { status: 401 }) };
  }

  const anonClient = createAnonServerSupabaseClient(SUPABASE_URL, ANON_KEY);
  const caller = await getUserFromAccessToken(anonClient, token);
  if (!caller) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired session" }, { status: 401 }) };
  }

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Looked up via the Admin API against auth.users directly, not `profiles`
  // -- a developer account may have no profiles row at all.
  const { data: callerUser } = await serviceClient.auth.admin.getUserById(caller.id);
  const email = callerUser.user?.email?.toLowerCase();
  if (!email || !DEVELOPER_EMAILS.includes(email)) {
    return { ok: false, response: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
  }

  return { ok: true, callerId: caller.id, email, serviceClient };
}
