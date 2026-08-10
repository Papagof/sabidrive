"use client";

import type { ReactNode } from "react";
import { SupabaseProvider } from "@tripme/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SupabaseProvider url={SUPABASE_URL} anonKey={SUPABASE_ANON_KEY}>
      {children}
    </SupabaseProvider>
  );
}
