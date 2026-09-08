"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useSupabaseClient } from "../context";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  role: "parent" | "driver" | "admin" | "student";
  school_id: string | null;
  avatar_url: string | null;
  notification_prefs: Record<string, boolean>;
}

export interface SessionState {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
}

/** Current auth session plus the caller's `profiles` row (role/school_id). */
export function useSession(): SessionState {
  const supabase = useSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile(userId: string) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (!isMounted) return;
      if (error?.code === "PGRST116") {
        // The session's JWT is still locally valid (signature-based, not
        // re-checked against the DB), but the account behind it is gone --
        // deleted server-side, e.g. an admin wiping accounts. Sign out to
        // clear the stale session instead of leaving every session-gated
        // page (RootPage, useRequireAdmin/useRequireRole) in a broken
        // half-signed-in state where `session` is truthy but `profile`
        // never loads. onAuthStateChange below picks up the resulting
        // signed-out state and clears session/profile for us.
        await supabase.auth.signOut();
        return;
      }
      setProfile((data as Profile) ?? null);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session) void loadProfile(data.session.user.id);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        void loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  return { session, profile, isLoading };
}
