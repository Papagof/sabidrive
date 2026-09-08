"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@sabidrive/supabase";

// Bare sabidrive.com's "/" (rewritten here by middleware.ts) used to show a
// static "choose Parent/Driver vs School Admin" screen. Now it's a thin
// session-gate, same shape as apps/family/src/app/page.tsx's RootPage, so a
// signed-out visitor goes straight to one login form instead of picking an
// app first, and an already-signed-in one lands on their role's home
// directly. The admin-role bridge (see /login) only fires on a fresh
// sign-in, not here -- an admin-role account found already signed in on
// this origin (e.g. via the cross-role-guardian feature) still correctly
// lands on /parent, unchanged from before this.
export default function StartPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
    } else if (profile) {
      router.replace(profile.role === "driver" ? "/driver" : "/parent");
    }
  }, [isLoading, session, profile, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-neutral-500">Loading SabiDrive…</p>
    </main>
  );
}
