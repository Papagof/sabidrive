"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Card } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";

interface AuditLogRow {
  id: number;
  action: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  route_deleted: "Route deleted",
  bus_deleted: "Bus deleted",
  bus_retired: "Bus retired",
  bus_restored: "Bus restored",
  guardian_removed: "Guardian removed",
  driver_deactivated: "Driver deactivated",
  driver_reactivated: "Driver reactivated",
  user_invited: "User invited"
};

function detailText(row: AuditLogRow): string | null {
  const d = row.details;
  if (typeof d.name === "string") return d.name;
  if (typeof d.label === "string") return d.label;
  if (typeof d.email === "string") return typeof d.role === "string" ? `${d.email} (${d.role})` : d.email;
  if (typeof d.student_id === "string") return `Student ${d.student_id}`;
  return null;
}

export default function ActivityPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);

  useEffect(() => {
    if (!profile?.school_id) return;
    adminQueries.getAuditLog(supabase, profile.school_id).then((data) => setRows(data as unknown as AuditLogRow[]));
  }, [supabase, profile?.school_id]);

  if (isLoading) return null;

  return (
    <AdminShell>
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">Activity</h1>
      <p className="mb-4 text-xs text-neutral-500">Shows the 100 most recent admin actions.</p>

      <div className="flex flex-col gap-2">
        {rows === null ? <p className="text-neutral-500">Loading…</p> : null}
        {rows !== null && rows.length === 0 ? <p className="text-neutral-500">No activity yet.</p> : null}
        {rows?.map((row) => (
          <Card key={row.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{ACTION_LABEL[row.action] ?? row.action}</p>
              <p className="text-sm text-neutral-500">
                {row.actor?.full_name ?? "Unknown"}
                {detailText(row) ? ` · ${detailText(row)}` : ""}
              </p>
            </div>
            <p className="text-sm text-neutral-500">{new Date(row.created_at).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
