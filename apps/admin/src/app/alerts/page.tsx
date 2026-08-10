"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill } from "@tripme/ui";
import { adminQueries, useSupabaseClient } from "@tripme/supabase";

interface AlertRow {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

const severityTone = { info: "info", warning: "caution", critical: "critical" } as const;

export default function AlertsPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  async function refetch() {
    if (!profile?.school_id) return;
    const data = await adminQueries.getSchoolAlerts(supabase, profile.school_id);
    setAlerts(data as unknown as AlertRow[]);
  }

  useEffect(() => {
    void refetch();
    if (!profile?.school_id) return;
    const channel = supabase
      .channel("admin-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => void refetch())
      .subscribe();
    return () => void supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, profile?.school_id]);

  if (isLoading) return null;

  async function handleResolve(alertId: string) {
    if (!profile) return;
    await adminQueries.resolveAlert(supabase, alertId, profile.id);
    await refetch();
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Alerts</h1>
      <div className="flex flex-col gap-2">
        {alerts.map((alert) => (
          <Card key={alert.id} className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <StatusPill label={alert.type.replace(/_/g, " ")} tone={severityTone[alert.severity]} />
                {alert.resolved_at ? <StatusPill label="resolved" tone="positive" /> : null}
              </div>
              <p className="mt-1 text-sm text-neutral-500">{new Date(alert.created_at).toLocaleString()}</p>
              {Object.keys(alert.payload).length > 0 ? (
                <p className="text-sm text-neutral-600">{JSON.stringify(alert.payload)}</p>
              ) : null}
            </div>
            {!alert.resolved_at ? <Button variant="secondary" onClick={() => handleResolve(alert.id)}>Resolve</Button> : null}
          </Card>
        ))}
        {alerts.length === 0 ? <p className="text-neutral-500">No alerts.</p> : null}
      </div>
    </AdminShell>
  );
}
