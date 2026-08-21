import { NextResponse } from "next/server";
import { createAnonServerSupabaseClient, createServiceRoleSupabaseClient } from "@sabidrive/supabase/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const GENERIC_ERROR = "Invalid phone number or password";

interface LoginBody {
  phone?: string;
  password?: string;
}

/**
 * Public — the caller has no session yet. The phone number is only used to
 * look up which account's email to authenticate; the real password check
 * still happens via signInWithPassword. Deliberately never returns the
 * resolved email to the client, and gives the exact same generic error for
 * "no such phone" and "wrong password" so this endpoint can't be used to
 * enumerate which phone numbers have accounts.
 */
export async function POST(req: Request) {
  let body: LoginBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  const password = body.password;
  if (!phone || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const serviceClient = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("phone", phone)
    .eq("phone_verified", true)
    .maybeSingle();

  if (!profile?.email) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const anonClient = createAnonServerSupabaseClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({ email: profile.email, password });

  if (error || !data.session) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
  });
}
