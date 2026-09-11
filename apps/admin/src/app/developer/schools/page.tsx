"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, StatusPill } from "@sabidrive/ui";
import { adminQueries, useSession, useSupabaseClient } from "@sabidrive/supabase";
import { AdminShell } from "@/components/AdminShell";

interface DeveloperSchoolRow {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  created_at: string;
  deactivated_at: string | null;
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
  const [searchTerm, setSearchTerm] = useState("");

  const [confirmingDeactivateId, setConfirmingDeactivateId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSentFor, setMessageSentFor] = useState<string | null>(null);

  async function refetch() {
    const data = await adminQueries.getDeveloperSchools(supabase);
    setSchools(data as unknown as DeveloperSchoolRow[]);
  }

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    refetch().catch((err) => setError(err instanceof Error ? err.message : "Failed to load schools"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, session, supabase, router]);

  if (isLoading || !session) return null;

  if (error) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="text-neutral-600">{error}</p>
        </div>
      </AdminShell>
    );
  }

  async function handleToggleDeactivate(school: DeveloperSchoolRow) {
    setTogglingId(school.id);
    setActionError(null);
    try {
      await adminQueries.setSchoolDeactivated(supabase, school.id, !school.deactivated_at);
      setConfirmingDeactivateId(null);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update school status");
    } finally {
      setTogglingId(null);
    }
  }

  function startMessage(schoolId: string) {
    setMessagingId(schoolId);
    setMessageSubject("");
    setMessageBody("");
    setMessageError(null);
    setMessageSentFor(null);
  }

  async function handleSendMessage(schoolId: string) {
    setIsSendingMessage(true);
    setMessageError(null);
    try {
      await adminQueries.sendDeveloperMessage(supabase, schoolId, messageSubject.trim(), messageBody.trim());
      setMessagingId(null);
      setMessageSentFor(schoolId);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSendingMessage(false);
    }
  }

  const filteredSchools =
    schools?.filter((s) => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return s.name.toLowerCase().includes(term) || (s.address ?? "").toLowerCase().includes(term);
    }) ?? null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-2xl font-semibold text-brand-800">All schools</h1>
        {actionError ? (
          <Banner tone="caution" title="Couldn't complete that" className="mb-4">
            {actionError}
          </Banner>
        ) : null}
        {schools !== null ? (
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search schools by name or address…"
            className="mb-4 min-h-control w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
          />
        ) : null}
        {schools === null ? <p className="text-neutral-500">Loading…</p> : null}
        {filteredSchools !== null ? (
          <div className="flex flex-col gap-2">
            {filteredSchools.map((s) => (
              <Card key={s.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{s.name}</p>
                      {s.deactivated_at ? <StatusPill label="Deactivated" tone="caution" /> : null}
                    </div>
                    <p className="text-sm text-neutral-500">
                      {s.address ?? "No address"} · {s.timezone} · created {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-sm text-neutral-600">
                    {s.studentCount} active student{s.studentCount === 1 ? "" : "s"} · {s.busCount} bus{s.busCount === 1 ? "" : "es"}
                  </p>
                </div>

                {confirmingDeactivateId === s.id ? (
                  <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
                    <span className="flex-1 text-sm text-neutral-500">
                      {s.deactivated_at
                        ? "Reactivate this school? Every admin, driver, and parent will be able to sign in again."
                        : "Deactivate this school? This blocks sign-in for every admin, driver, and parent at this school."}
                    </span>
                    <Button variant="secondary" disabled={togglingId === s.id} onClick={() => handleToggleDeactivate(s)}>
                      {togglingId === s.id ? "Working..." : s.deactivated_at ? "Confirm reactivate" : "Confirm deactivate"}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingDeactivateId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 border-t border-neutral-100 pt-2">
                    <Button variant="ghost" onClick={() => setConfirmingDeactivateId(s.id)}>
                      {s.deactivated_at ? "Reactivate" : "Deactivate"}
                    </Button>
                    <Button variant="ghost" onClick={() => startMessage(s.id)}>
                      Message school
                    </Button>
                  </div>
                )}

                {messagingId === s.id ? (
                  <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
                    <input
                      value={messageSubject}
                      onChange={(e) => setMessageSubject(e.target.value)}
                      placeholder="Subject"
                      required
                      className="min-h-control rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                    />
                    <textarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder="Message to this school's admin…"
                      required
                      rows={4}
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    />
                    {messageError ? <p className="text-sm text-critical-600">{messageError}</p> : null}
                    <div className="flex gap-2">
                      <Button
                        disabled={isSendingMessage || !messageSubject.trim() || !messageBody.trim()}
                        onClick={() => handleSendMessage(s.id)}
                      >
                        {isSendingMessage ? "Sending..." : "Send"}
                      </Button>
                      <Button variant="ghost" onClick={() => setMessagingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                {messageSentFor === s.id ? <p className="text-sm text-calm-700">Message sent.</p> : null}
              </Card>
            ))}
            {filteredSchools.length === 0 ? (
              <p className="text-neutral-500">{searchTerm.trim() ? "No schools match your search." : "No schools yet."}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
