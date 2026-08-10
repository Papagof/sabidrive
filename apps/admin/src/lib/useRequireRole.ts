"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, type Profile } from "@tripme/supabase";

/** Admin app is single-role: redirects to /login unless signed in as an admin. */
export function useRequireAdmin() {
  const router = useRouter();
  const { session, profile, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (profile && profile.role !== ("admin" satisfies Profile["role"])) {
      router.replace("/login");
    }
  }, [isLoading, session, profile, router]);

  return { session, profile, isLoading };
}
