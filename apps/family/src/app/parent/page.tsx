"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@sabidrive/ui";
import { studentQueries, useSupabaseClient } from "@sabidrive/supabase";
import { useRequireGuardianAccess } from "@/lib/useRequireRole";
import { NotificationOptIn } from "@/components/NotificationOptIn";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  school_id: string;
  schools: { name: string } | null;
}

export default function ParentHomePage() {
  const { profile, isLoading } = useRequireGuardianAccess();
  const supabase = useSupabaseClient();
  const router = useRouter();
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

  // Children may attend different schools -- group by school when there's
  // more than one so it's obvious which bus/route each card belongs to.
  const schoolIds = Array.from(new Set(students.map((s) => s.school_id)));
  const isMultiSchool = schoolIds.length > 1;
  const groups = isMultiSchool
    ? schoolIds.map((schoolId) => ({
        schoolId,
        schoolName: students.find((s) => s.school_id === schoolId)?.schools?.name ?? "School",
        students: students.filter((s) => s.school_id === schoolId)
      }))
    : [{ schoolId: schoolIds[0] ?? "", schoolName: "", students }];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-800">Hi, {profile?.full_name}</h1>
        <div className="flex items-center gap-3">
          <Link href="/parent/announcements" className="text-sm text-brand-700">
            Announcements
          </Link>
          <Link href="/account" className="text-sm text-brand-700">
            Account
          </Link>
          <button
            className="text-sm text-neutral-500 hover:text-neutral-800"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      {profile ? <NotificationOptIn userId={profile.id} /> : null}
      <p className="text-neutral-600">Your children</p>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.schoolId} className="flex flex-col gap-3">
            {isMultiSchool ? <p className="text-sm font-medium text-neutral-500">{group.schoolName}</p> : null}
            {group.students.map((s) => (
              <Link key={s.id} href={`/parent/${s.id}`}>
                <Card className="transition hover:border-brand-300">
                  <p className="text-lg font-medium">
                    {s.first_name} {s.last_name}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {s.schools?.name ? `${s.schools.name} · ` : ""}Tap to view live bus &amp; notifications
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        ))}
        {students.length === 0 ? <p className="text-neutral-500">No children linked to your account yet.</p> : null}
      </div>
    </main>
  );
}
