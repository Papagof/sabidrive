import { NextResponse } from "next/server";
import {
  createAnonServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getUserFromAccessToken
} from "@sabidrive/supabase/server";

// Node runtime (not edge) — needs the service-role key and the Admin API.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Effectively indefinite -- Supabase's ban API takes a duration, not a flag.
const BAN_DURATION = "87600h";

interface DeactivateBody {
  driverId?: string;
  deactivate?: boolean;
}

/**
 * Revokes (or restores) a driver's ability to sign in, without deleting
 * their account -- trips.driver_id is a required FK with no cascade, so a
 * driver who has ever driven a trip can't be hard-deleted without either
 * failing outright or losing that trip's audit trail. This is the reversible
 * alternative: flips profiles.deactivated_at (for the admin UI), unassigns
 * them from any bus they currently drive, and actually blocks login via
 * Supabase Auth's own ban mechanism (a UI-level check alone wouldn't stop a
 * banned driver from calling the API directly).
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
  const { data: callerProfile, error: callerError } = await serviceClient
    .from("profiles")
    .select("role, school_id")
    .eq("id", caller.id)
    .single();
  if (callerError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.school_id) {
    return NextResponse.json({ error: "Only school admins can do this" }, { status: 403 });
  }

  let body: DeactivateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { driverId, deactivate } = body;
  if (!driverId || typeof deactivate !== "boolean") {
    return NextResponse.json({ error: "driverId and deactivate (boolean) are required" }, { status: 400 });
  }

  const { data: target, error: targetError } = await serviceClient
    .from("profiles")
    .select("role, school_id")
    .eq("id", driverId)
    .single();
  if (targetError || !target || target.role !== "driver" || target.school_id !== callerProfile.school_id) {
    return NextResponse.json({ error: "Driver not found in your school" }, { status: 404 });
  }

  const { error: banError } = await serviceClient.auth.admin.updateUserById(driverId, {
    ban_duration: deactivate ? BAN_DURATION : "none"
  });
  if (banError) {
    return NextResponse.json({ error: banError.message }, { status: 400 });
  }

  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({ deactivated_at: deactivate ? new Date().toISOString() : null })
    .eq("id", driverId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (deactivate) {
    const { error: unassignError } = await serviceClient.from("buses").update({ driver_id: null }).eq("driver_id", driverId);
    if (unassignError) {
      return NextResponse.json({ error: unassignError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
