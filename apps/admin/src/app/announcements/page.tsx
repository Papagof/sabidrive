"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card } from "@tripme/ui";
import { adminQueries, useSupabaseClient } from "@tripme/supabase";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

export default function AnnouncementsPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function refetch() {
    if (!profile?.school_id) return;
    const data = await adminQueries.getSchoolAnnouncements(supabase, profile.school_id);
    setAnnouncements(data as unknown as AnnouncementRow[]);
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  if (isLoading) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await adminQueries.createAnnouncement(supabase, title, body);
      setTitle("");
      setBody("");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send announcement");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Announcements</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card>
          <h2 className="mb-2 font-medium">New announcement</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              required
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message for all parents…"
              required
              rows={4}
              className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
            />
            {error ? <p className="text-sm text-critical-600">{error}</p> : null}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Sending..." : "Send to all parents"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-2">
          {announcements.map((a) => (
            <Card key={a.id}>
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-neutral-600">{a.body}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {a.profiles?.full_name} · {new Date(a.created_at).toLocaleString()}
              </p>
            </Card>
          ))}
          {announcements.length === 0 ? <p className="text-neutral-500">No announcements yet.</p> : null}
        </div>
      </div>
    </AdminShell>
  );
}
