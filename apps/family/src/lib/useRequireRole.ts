"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, type Profile } from "@tripme/supabase";

/** Redirects to /login (no session) or the correct home (wrong role) once loading settles. */
export function useRequireRole(allowedRoles: Profile["role"][]) {
  const router = useRouter();
  const { session, profile, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (profile && !allowedRoles.includes(profile.role)) {
      router.replace(profile.role === "driver" ? "/driver" : "/parent");
    }
  }, [isLoading, session, profile, allowedRoles, router]);

  return { session, profile, isLoading };
}
