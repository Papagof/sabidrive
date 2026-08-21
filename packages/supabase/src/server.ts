import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
import type { SabiDriveSupabaseClient } from "./client";

/**
 * Service-role client — bypasses RLS entirely. Only for trusted server-side
 * contexts: the local GPS simulator (packages/gps-sim) and the seed script
 * (scripts/seed.ts). Never import this into browser bundle code.
 */
export function createServiceRoleSupabaseClient(url: string, serviceRoleKey: string): SabiDriveSupabaseClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Anon-key client for server contexts with no session storage (e.g. a Route
 * Handler verifying a bearer token passed by the browser) — like the
 * browser client but without assuming `window`/localStorage exist.
 */
export function createAnonServerSupabaseClient(url: string, anonKey: string): SabiDriveSupabaseClient {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Anon-key client whose PostgREST/RPC calls run as the user behind
 * `accessToken` (auth.uid() resolves to them inside SECURITY DEFINER
 * functions) -- for a Route Handler that needs to call an RPC as the caller
 * rather than as service-role.
 */
export function createUserScopedServerSupabaseClient(url: string, anonKey: string, accessToken: string): SabiDriveSupabaseClient {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

/** Resolves the caller behind a bearer token, or null if it's invalid/expired. */
export async function getUserFromAccessToken(
  anonClient: SabiDriveSupabaseClient,
  accessToken: string
): Promise<{ id: string } | null> {
  const { data, error } = await anonClient.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
