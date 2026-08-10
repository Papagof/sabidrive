"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill, statusToneMap } from "@tripme/ui";
import { adminQueries, useSupabaseClient } from "@tripme/supabase";

interface BusRow {
  id: string;
  label: string;
  status: string;
  driver: { id: string; full_name: string } | null;
  routes: { id: string; name: string } | null;
}

interface OptionRow {
  id: string;
  name: string;
}

export default function BusesPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; full_name: string }[]>([]);
  const [routes, setRoutes] = useState<OptionRow[]>([]);

  const [label, setLabel] = useState("");
  const [driverId, setDriverId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function refetch() {
    if (!profile?.school_id) return;
    const busData = await adminQueries.getSchoolBuses(supabase, profile.school_id);
    setBuses(busData as unknown as BusRow[]);
    const { data: driverRows } = await supabase.from("profiles").select("id, full_name").eq("school_id", profile.school_id).eq("role", "driver");
    setDrivers(driverRows ?? []);
    const { data: routeRows } = await supabase.from("routes").select("id, name").eq("school_id", profile.school_id);
    setRoutes(routeRows ?? []);
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  if (isLoading) return null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminQueries.createBus(supabase, {
        school_id: profile.school_id,
        label,
        driver_id: driverId || null,
        default_route_id: routeId || null
      });
      setLabel("");
      setDriverId("");
      setRouteId("");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bus");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Buses</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card>
          <h2 className="mb-2 font-medium">New bus</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bus label (e.g. Bus 12)"
              required
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            />
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Assign driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Assign route…</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {error ? <p className="text-sm text-critical-600">{error}</p> : null}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Create bus"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-2">
          {buses.map((bus) => (
            <Card key={bus.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{bus.label}</p>
                <p className="text-sm text-neutral-500">
                  {bus.driver?.full_name ?? "No driver"} · {bus.routes?.name ?? "No route"}
                </p>
              </div>
              <StatusPill label={bus.status} tone={statusToneMap[bus.status] ?? "neutral"} />
            </Card>
          ))}
          {buses.length === 0 ? <p className="text-neutral-500">No buses yet.</p> : null}
        </div>
      </div>
    </AdminShell>
  );
}
