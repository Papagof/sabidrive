"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@sabidrive/ui";
import { adminQueries, useSession, useSupabaseClient } from "@sabidrive/supabase";

interface DeveloperSchoolRow {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  created_at: string;
  studentCount: number;
  busCount: number;
}

// Gated on a bare session, not useRequireAdmin() -- a developer account may
// have no admin-role profile at all. Real authorization is entirely
// server-side (DEVELOPER_EMAILS allowlist in the Route Handler); this page
// just needs *a* session to attach as a bearer token.
export default function DeveloperSchoolsPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { session, isLoading } = useSession();
  const [schools, setSchools] = useState<DeveloperSchoolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    adminQueries
      .getDeveloperSchools(supabase)
      .then(setSchools)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load schools"));
  }, [isLoading, session, supabase, router]);

  if (isLoading || !session) return null;

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-neutral-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">All schools</h1>
      {schools === null ? <p className="text-neutral-500">Loading…</p> : null}
      {schools !== null ? (
        <div className="flex flex-col gap-2">
          {schools.map((s) => (
            <Card key={s.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-neutral-500">
                  {s.address ?? "No address"} · {s.timezone} · created {new Date(s.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm text-neutral-600">
                {s.studentCount} student{s.studentCount === 1 ? "" : "s"} · {s.busCount} bus{s.busCount === 1 ? "" : "es"}
              </p>
            </Card>
          ))}
          {schools.length === 0 ? <p className="text-neutral-500">No schools yet.</p> : null}
        </div>
      ) : null}
    </main>
  );
}
