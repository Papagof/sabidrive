"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@tripme/supabase";

export default function RootPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;
    router.replace(session ? "/dashboard" : "/login");
  }, [isLoading, session, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-neutral-500">Loading Tripme Admin…</p>
    </main>
  );
}
