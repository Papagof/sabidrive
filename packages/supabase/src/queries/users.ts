import type { TripmeSupabaseClient } from "../client";

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: "driver" | "parent" | "admin";
  phone?: string;
}

/**
 * Calls the admin app's `/api/invite-user` Route Handler (the one place
 * that's allowed to touch the Supabase service-role key) to invite a new
 * driver, parent, or co-admin by email.
 */
export async function inviteUser(supabase: TripmeSupabaseClient, input: InviteUserInput): Promise<{ userId: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const response = await fetch("/api/invite-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to invite user");
  }
  return body as { userId: string };
}
