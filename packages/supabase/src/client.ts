import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";

export type SabiDriveSupabaseClient = SupabaseClient<Database>;

/** Browser client — uses the public anon key, subject to RLS. */
export function createBrowserSupabaseClient(url: string, anonKey: string): SabiDriveSupabaseClient {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}
