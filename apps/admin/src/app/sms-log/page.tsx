"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill } from "@sabidrive/ui";
import { adminQueries, buildSmsCsv, useSupabaseClient } from "@sabidrive/supabase";

interface SmsRow {
  id: string;
  recipient_phone: string;
  body: string;
  status: string;
  created_at: string;
}

export default function SmsLogPage() {
  const { isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [rows, setRows] = useState<SmsRow[]>([]);

  useEffect(() => {
    adminQueries.getSmsOutbox(supabase).then((data) => setRows(data as unknown as SmsRow[]));
  }, [supabase]);

  if (isLoading) return null;

  function handleExportCsv() {
    const csv = buildSmsCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sabidrive-sms-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-800">SMS log</h1>
        <Button variant="secondary" size="md" onClick={handleExportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <p className="mb-1 text-neutral-600">
        Simulated SMS fallback — no real gateway is wired up yet, this is a log of what would have been sent for
        boarding/drop-off/SOS/mismatch/announcement notifications when a guardian has a phone number on file.
      </p>
      <p className="mb-4 text-xs text-neutral-500">Exports the 100 most recent records shown here.</p>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <Card key={row.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{row.recipient_phone}</p>
              <p className="text-sm text-neutral-600">{row.body}</p>
              <p className="mt-1 text-xs text-neutral-500">{new Date(row.created_at).toLocaleString()}</p>
            </div>
            <StatusPill label={row.status} tone="neutral" />
          </Card>
        ))}
        {rows.length === 0 ? <p className="text-neutral-500">No SMS activity yet.</p> : null}
      </div>
    </AdminShell>
  );
}
