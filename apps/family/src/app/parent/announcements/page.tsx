"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@sabidrive/ui";
import { studentQueries, useNotifications, useSupabaseClient } from "@sabidrive/supabase";
import { useRequireGuardianAccess } from "@/lib/useRequireRole";
import { SchoolLogo } from "@/components/SchoolLogo";

interface AnnouncementsStudentRow {
  school_id: string;
  schools: { logo_url: string | null } | null;
}

export default function AnnouncementsPage() {
  const { profile, isLoading } = useRequireGuardianAccess();
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { notifications } = useNotifications(profile?.id ?? null);
  const announcements = notifications.filter((n) => n.type === "announcement");
  const [students, setStudents] = useState<AnnouncementsStudentRow[]>([]);

  useEffect(() => {
    if (!profile) return;
    studentQueries.getGuardianStudents(supabase, profile.id).then((data) => setStudents(data as unknown as AnnouncementsStudentRow[]));
  }, [supabase, profile]);

  if (isLoading) return null;

  // Same "only show a logo when every linked child shares one school"
  // fallback as the parent home page -- a genuinely multi-school guardian
  // has no single school to represent here.
  const schoolIds = Array.from(new Set(students.map((s) => s.school_id)));
  const logoUrl = schoolIds.length === 1 ? (students[0]?.schools?.logo_url ?? null) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <button onClick={() => router.push("/parent")} className="self-start text-sm text-brand-700">
        ← All children
      </button>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-800">
        <SchoolLogo logoUrl={logoUrl} />
        Announcements
      </h1>
      <div className="flex flex-col gap-2">
        {announcements.length === 0 ? (
          <p className="text-neutral-500">No announcements yet.</p>
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <p className="font-medium">{a.title}</p>
              {a.body ? <p className="text-sm text-neutral-600">{a.body}</p> : null}
              <p className="mt-1 text-xs text-neutral-500">{new Date(a.created_at).toLocaleString()}</p>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
