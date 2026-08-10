import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
import type { TripmeSupabaseClient } from "./client";

/**
 * Service-role client — bypasses RLS entirely. Only for trusted server-side
 * contexts: the local GPS simulator (packages/gps-sim) and the seed script
 * (scripts/seed.ts). Never import this into browser bundle code.
 */
export function createServiceRoleSupabaseClient(url: string, serviceRoleKey: string): TripmeSupabaseClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
