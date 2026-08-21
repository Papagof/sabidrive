import { NextResponse } from "next/server";
import {
  createAnonServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getUserFromAccessToken
} from "@sabidrive/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface LookupBody {
  email?: string;
}

/**
 * Looks up an existing account by email, regardless of role or which
 * school it belongs to -- used to attach an already-registered guardian
 * (e.g. an admin whose own child attends a different school, or a parent
 * whose other child attends a different school) to a student here, instead
 * of trying (and failing, since Supabase Auth emails are globally unique)
 * to invite a duplicate account. Being a guardian is independent of an
 * account's primary role (0024_cross_role_guardians.sql). Deliberately
 * returns only enough to confirm identity (id + name) -- never phone,
 * other children, or which other schools/roles they belong to -- so this
 * can't be used to fish for account details belonging to another school's
 * families.
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
    .select("role")
    .eq("id", caller.id)
    .single();

  if (profileError || !callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Only school admins can look up guardians" }, { status: 403 });
  }

  let body: LookupBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const { data: guardian } = await serviceClient.from("profiles").select("id, full_name").eq("email", email).maybeSingle();

  if (!guardian) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, id: guardian.id, full_name: guardian.full_name });
}
