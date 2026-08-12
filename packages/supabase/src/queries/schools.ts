import type { TripmeSupabaseClient } from "../client";

export interface SignUpSchoolInput {
  school_name: string;
  address: string;
  geofence_lat: number;
  geofence_lng: number;
  full_name: string;
  email: string;
  password: string;
}

/**
 * Calls the admin app's public `/api/signup-school` Route Handler to
 * provision a brand-new school + its first admin account, then signs the
 * browser in with the same credentials (the route has no way to hand back
 * a session token directly).
 */
export async function signUpSchool(supabase: TripmeSupabaseClient, input: SignUpSchoolInput): Promise<void> {
  const response = await fetch("/api/signup-school", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to sign up");
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password
  });
  if (signInError) throw signInError;
}
