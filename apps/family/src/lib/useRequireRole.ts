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

/**
 * For the family app's guardian-facing pages (/parent, /account). Being a
 * guardian is independent of primary role -- an admin or driver can also be
 * a parent elsewhere (0024_cross_role_guardians.sql) -- so this only
 * requires a session, never redirects based on role. RLS scopes data to the
 * caller's own guardian_student_links rows; an account with none just sees
 * the pages' existing "no children linked" empty state.
 */
export function useRequireGuardianAccess() {
  const router = useRouter();
  const { session, profile, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;
    if (!session) router.replace("/login");
  }, [isLoading, session, router]);

  return { session, profile, isLoading };
}
