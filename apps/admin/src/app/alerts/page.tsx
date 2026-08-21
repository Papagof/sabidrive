"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";

interface AlertRow {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  notes: string | null;
  assigned_to: string | null;
}

const severityTone = { info: "info", warning: "caution", critical: "critical" } as const;
const SEVERITY_FILTERS = ["all", "info", "warning", "critical"] as const;

export default function AlertsPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [severityFilter, setSeverityFilter] = useState<(typeof SEVERITY_FILTERS)[number]>("all");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");

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

  async function handleAssign(alertId: string) {
    if (!profile) return;
    await adminQueries.assignAlertToSelf(supabase, alertId, profile.id);
    await refetch();
  }

  async function handleSubmitResolve(alertId: string) {
    if (!profile) return;
    await adminQueries.resolveAlert(supabase, alertId, profile.id, resolveNotes || undefined);
    setResolvingId(null);
    setResolveNotes("");
    await refetch();
  }

  const filteredAlerts = severityFilter === "all" ? alerts : alerts.filter((a) => a.severity === severityFilter);

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Alerts</h1>

      <div className="mb-4 flex gap-2">
        {SEVERITY_FILTERS.map((sev) => (
          <Button
            key={sev}
            variant={severityFilter === sev ? "primary" : "secondary"}
            size="md"
            onClick={() => setSeverityFilter(sev)}
          >
            {sev}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filteredAlerts.map((alert) => (
          <Card key={alert.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <StatusPill label={alert.type.replace(/_/g, " ")} tone={severityTone[alert.severity]} />
                  {alert.resolved_at ? <StatusPill label="resolved" tone="positive" /> : null}
                  {alert.assigned_to ? (
                    <StatusPill label={alert.assigned_to === profile?.id ? "assigned to you" : "assigned"} tone="info" />
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-neutral-500">{new Date(alert.created_at).toLocaleString()}</p>
                {Object.keys(alert.payload).length > 0 ? (
                  <p className="text-sm text-neutral-600">{JSON.stringify(alert.payload)}</p>
                ) : null}
                {alert.notes ? <p className="mt-1 text-sm text-neutral-700">Notes: {alert.notes}</p> : null}
              </div>
              {!alert.resolved_at ? (
                <div className="flex gap-2">
                  {!alert.assigned_to ? (
                    <Button variant="ghost" onClick={() => handleAssign(alert.id)}>
                      Assign to me
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setResolvingId(alert.id);
                      setResolveNotes("");
                    }}
                  >
                    Resolve
                  </Button>
                </div>
              ) : null}
            </div>
            {resolvingId === alert.id ? (
              <div className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <textarea
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="Resolution notes (optional)"
                  rows={2}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <Button onClick={() => handleSubmitResolve(alert.id)}>Confirm resolve</Button>
                  <Button variant="ghost" onClick={() => setResolvingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        ))}
        {filteredAlerts.length === 0 ? <p className="text-neutral-500">No alerts.</p> : null}
      </div>
    </AdminShell>
  );
}
