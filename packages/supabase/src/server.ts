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

/**
 * First IP in `x-forwarded-for` (Vercel sets this on every request) -- the
 * closest thing to a real client IP available in a Route Handler.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * For Route Handlers reachable with no bearer token at all (signup-school,
 * login-with-phone) -- see 0037_rate_limiting.sql for the actual
 * fixed-window-log logic. Fails OPEN (returns true/allowed) if the RPC call
 * itself errors: a rate limiter is defense-in-depth, not a hard
 * requirement, and failing closed would turn a transient DB hiccup into a
 * full signup/login outage.
 */
export async function checkRateLimit(
  supabase: SabiDriveSupabaseClient,
  bucket: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds
  });
  if (error) {
    console.error("rate limit check failed, failing open", error);
    return true;
  }
  return data === true;
}
