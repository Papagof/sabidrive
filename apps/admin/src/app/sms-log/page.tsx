"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Card, StatusPill } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";

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

  return (
    <AdminShell>
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">SMS log</h1>
      <p className="mb-4 text-neutral-600">
        Simulated SMS fallback — no real gateway is wired up yet, this is a log of what would have been sent for
        boarding/drop-off/SOS/mismatch/announcement notifications when a guardian has a phone number on file.
      </p>
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
