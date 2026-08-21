import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@sabidrive/supabase/server";

// Node runtime (not edge) — needs the service-role key and the Admin API.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface SignupBody {
  school_name?: string;
  address?: string;
  geofence_lat?: number;
  geofence_lng?: number;
  full_name?: string;
  email?: string;
  password?: string;
}

/**
 * Public — no bearer token, because the caller has no account yet. This is
 * the only place a new tenant gets created, so the safety property that
 * matters is: nothing about *which* school/role beyond the submitted name
 * and contact fields is ever client-controlled. The route always creates a
 * brand-new school itself (never accepts an existing school_id) and always
 * sets the new user's role to exactly 'admin'.
 */
export async function POST(req: Request) {
  let body: SignupBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { school_name, address, geofence_lat, geofence_lng, full_name, email, password } = body;
  if (!school_name?.trim() || !full_name?.trim() || !email || !password) {
    return NextResponse.json(
      { error: "school_name, full_name, email, and password are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  // Required per product decision: a school can't sign up without a real
  // address and a device-captured location (see signup/page.tsx — the
  // browser Geolocation API is what actually produces lat/lng).
  if (!address?.trim()) {
    return NextResponse.json({ error: "School address is required" }, { status: 400 });
  }
  const isValidLat = typeof geofence_lat === "number" && Number.isFinite(geofence_lat) && Math.abs(geofence_lat) <= 90;
  const isValidLng = typeof geofence_lng === "number" && Number.isFinite(geofence_lng) && Math.abs(geofence_lng) <= 180;
  if (!isValidLat || !isValidLng) {
    return NextResponse.json(
      { error: "Device location is required — please enable location access and retry" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .insert({
      name: school_name.trim(),
      address: address.trim(),
      geofence_lat,
      geofence_lng,
      timezone: "UTC",
      geofence_radius_m: 300
    })
    .select()
    .single();

  if (schoolError || !school) {
    return NextResponse.json({ error: schoolError?.message ?? "Failed to create school" }, { status: 500 });
  }

  const { data: user, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), role: "admin", school_id: school.id }
  });

  if (userError || !user.user) {
    // Compensating cleanup: never leave an orphaned empty school behind.
    await supabase.from("schools").delete().eq("id", school.id);
    return NextResponse.json({ error: userError?.message ?? "Failed to create admin account" }, { status: 400 });
  }

  return NextResponse.json({ schoolId: school.id, userId: user.user.id });
}
