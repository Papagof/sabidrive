"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useSupabaseClient } from "../context";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: "parent" | "driver" | "admin" | "student";
  school_id: string | null;
  avatar_url: string | null;
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
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (isMounted) setProfile((data as Profile) ?? null);
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
