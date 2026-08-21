"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card } from "@sabidrive/ui";
import type { MapPoint } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";

const ClickToAddMap = dynamic(() => import("@sabidrive/ui").then((m) => m.ClickToAddMap), { ssr: false });

interface RouteDetail {
  id: string;
  name: string;
  direction: string;
  polyline: MapPoint[];
}

interface StopRow {
  id: string;
  name: string;
  sequence_no: number;
  lat: number;
  lng: number;
  scheduled_time: string | null;
}

export default function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();

  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [pendingPoint, setPendingPoint] = useState<MapPoint | null>(null);
  const [stopName, setStopName] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function refetch() {
    const { data: routeData } = await supabase.from("routes").select("id, name, direction, polyline").eq("id", routeId).single();
    setRoute(routeData as unknown as RouteDetail | null);
    const { data: stopRows } = await supabase.from("stops").select("*").eq("route_id", routeId).order("sequence_no");
    setStops((stopRows as StopRow[] | null) ?? []);
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  if (isLoading) return null;

  async function handleAddStop(e: FormEvent) {
    e.preventDefault();
    if (!pendingPoint || !profile?.school_id) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminQueries.createStop(supabase, {
        route_id: routeId,
        school_id: profile.school_id,
        name: stopName,
        sequence_no: stops.length + 1,
        lat: pendingPoint.lat,
        lng: pendingPoint.lng,
        radius_m: 150
      });
      setPendingPoint(null);
      setStopName("");
      setScheduledTime("");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add stop");
    } finally {
      setIsSaving(false);
    }
  }

  const markerPoints: MapPoint[] = [...stops.map((s) => ({ lat: s.lat, lng: s.lng })), ...(pendingPoint ? [pendingPoint] : [])];

  return (
    <AdminShell>
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">{route?.name ?? "Route"}</h1>
      <p className="mb-4 text-neutral-500">{route?.direction}</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-medium">Stops</h2>
            <ol className="flex flex-col gap-2">
              {stops.map((s) => (
                <li key={s.id} className="text-sm">
                  <span className="font-medium">{s.sequence_no}.</span> {s.name}
                  {s.scheduled_time ? <span className="text-neutral-500"> — {s.scheduled_time}</span> : null}
                </li>
              ))}
              {stops.length === 0 ? <p className="text-sm text-neutral-500">No stops yet.</p> : null}
            </ol>
          </Card>

          <Card>
            <h2 className="mb-2 font-medium">Add a stop</h2>
            {pendingPoint ? (
              <form onSubmit={handleAddStop} className="flex flex-col gap-2">
                <p className="text-xs text-neutral-500">
                  {pendingPoint.lat.toFixed(5)}, {pendingPoint.lng.toFixed(5)}
                </p>
                <input
                  value={stopName}
                  onChange={(e) => setStopName(e.target.value)}
                  placeholder="Stop name"
                  required
                  className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                />
                {error ? <p className="text-sm text-critical-600">{error}</p> : null}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Saving..." : "Add stop"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setPendingPoint(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-neutral-500">Click the map to place a stop.</p>
            )}
          </Card>
        </div>
        <div className="h-[28rem] overflow-hidden rounded-2xl border border-neutral-200">
          <ClickToAddMap
            points={markerPoints}
            center={route?.polyline?.[0]}
            onAddPoint={(p) => setPendingPoint(p)}
          />
        </div>
      </div>
    </AdminShell>
  );
}
