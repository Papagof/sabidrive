import { NextResponse } from "next/server";
import {
  createAnonServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getUserFromAccessToken
} from "@tripme/supabase/server";

// Node runtime (not edge) — needs the service-role key and the full
// supabase-js Admin API surface.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FAMILY_APP_URL = process.env.FAMILY_APP_URL!;

interface InviteBody {
  email?: string;
  full_name?: string;
  role?: "driver" | "parent";
  phone?: string;
}

/**
 * Invites a driver or parent by email. This is the one privileged,
 * server-side operation in an otherwise fully client-side app — creating an
 * auth user requires the service-role key, which can never run in the
 * browser. `role`/`school_id` are always derived from the *caller's own*
 * verified profile, never taken from the request body, so an admin can only
 * ever invite people into their own school and can never mint another admin
 * through this endpoint.
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
  const { data: callerProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role, school_id")
    .eq("id", caller.id)
    .single();

  if (profileError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.school_id) {
    return NextResponse.json({ error: "Only school admins can invite users" }, { status: 403 });
  }

  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, full_name, role, phone } = body;
  if (!email || !full_name || (role !== "driver" && role !== "parent")) {
    return NextResponse.json(
      { error: "email, full_name, and role ('driver' or 'parent') are required" },
      { status: 400 }
    );
  }

  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role, school_id: callerProfile.school_id, phone: phone || null },
    redirectTo: `${FAMILY_APP_URL}/set-password`
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ userId: data.user.id });
}
