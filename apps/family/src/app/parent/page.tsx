"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@tripme/ui";
import { studentQueries, useSupabaseClient } from "@tripme/supabase";
import { useRequireRole } from "@/lib/useRequireRole";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
}

export default function ParentHomePage() {
  const { profile, isLoading } = useRequireRole(["parent"]);
  const supabase = useSupabaseClient();
  const [students, setStudents] = useState<StudentRow[]>([]);

  useEffect(() => {
    if (!profile) return;
    studentQueries.getGuardianStudents(supabase, profile.id).then((data) => setStudents(data as unknown as StudentRow[]));
  }, [supabase, profile]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold text-brand-800">Hi, {profile?.full_name}</h1>
      <p className="text-neutral-600">Your children</p>
      <div className="flex flex-col gap-3">
        {students.map((s) => (
          <Link key={s.id} href={`/parent/${s.id}`}>
            <Card className="transition hover:border-brand-300">
              <p className="text-lg font-medium">
                {s.first_name} {s.last_name}
              </p>
              <p className="text-sm text-neutral-500">Tap to view live bus &amp; notifications</p>
            </Card>
          </Link>
        ))}
        {students.length === 0 ? <p className="text-neutral-500">No children linked to your account yet.</p> : null}
      </div>
    </main>
  );
}
