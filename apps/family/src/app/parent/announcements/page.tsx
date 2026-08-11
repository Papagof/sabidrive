"use client";

import { useRouter } from "next/navigation";
import { Card } from "@tripme/ui";
import { useNotifications } from "@tripme/supabase";
import { useRequireRole } from "@/lib/useRequireRole";

export default function AnnouncementsPage() {
  const { profile, isLoading } = useRequireRole(["parent"]);
  const router = useRouter();
  const { notifications } = useNotifications(profile?.id ?? null);
  const announcements = notifications.filter((n) => n.type === "announcement");

  if (isLoading) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <button onClick={() => router.push("/parent")} className="self-start text-sm text-brand-700">
        ← All children
      </button>
      <h1 className="text-2xl font-semibold text-brand-800">Announcements</h1>
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
