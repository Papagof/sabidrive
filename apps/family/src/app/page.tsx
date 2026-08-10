"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@tripme/supabase";

export default function RootPage() {
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
      <p className="text-neutral-500">Loading Tripme…</p>
    </main>
  );
}
