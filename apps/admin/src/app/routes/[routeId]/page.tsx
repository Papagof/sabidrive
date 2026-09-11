"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { AddressSearch, Button, Card } from "@sabidrive/ui";
import type { MapPoint } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";

const ClickToAddMap = dynamic(() => import("@sabidrive/ui").then((m) => m.ClickToAddMap), { ssr: false });

interface RouteDetail {
  id: string;
  name: string;
  direction: "pickup" | "dropoff";
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

  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeDirection, setRouteDirection] = useState<"pickup" | "dropoff">("pickup");
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [pendingPoint, setPendingPoint] = useState<MapPoint | null>(null);
  const [panTo, setPanTo] = useState<MapPoint | null>(null);
  const [stopName, setStopName] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStopName, setEditStopName] = useState("");
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [editPosition, setEditPosition] = useState<MapPoint | null>(null);
  const [isSavingStop, setIsSavingStop] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  const [confirmingDeleteStopId, setConfirmingDeleteStopId] = useState<string | null>(null);
  const [isDeletingStop, setIsDeletingStop] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

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

  function startEditRoute() {
    if (!route) return;
    setRouteName(route.name);
    setRouteDirection(route.direction);
    setRouteError(null);
    setIsEditingRoute(true);
  }

  async function handleSaveRoute() {
    setIsSavingRoute(true);
    setRouteError(null);
    try {
      await adminQueries.updateRoute(supabase, routeId, { name: routeName, direction: routeDirection });
      setIsEditingRoute(false);
      await refetch();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : "Failed to save route");
    } finally {
      setIsSavingRoute(false);
    }
  }

  async function handleAddStop(e: FormEvent) {
    e.preventDefault();
    if (!pendingPoint || !profile?.school_id) return;
    setIsSaving(true);
    setError(null);
    try {
      const nextSequenceNo = stops.reduce((max, s) => Math.max(max, s.sequence_no), 0) + 1;
      await adminQueries.createStop(supabase, {
        route_id: routeId,
        school_id: profile.school_id,
        name: stopName,
        sequence_no: nextSequenceNo,
        lat: pendingPoint.lat,
        lng: pendingPoint.lng,
        radius_m: 150,
        scheduled_time: scheduledTime || null
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

  function startEditStop(stop: StopRow) {
    setEditingStopId(stop.id);
    setEditStopName(stop.name);
    setEditScheduledTime(stop.scheduled_time ?? "");
    setEditPosition({ lat: stop.lat, lng: stop.lng });
    setStopError(null);
    setPendingPoint(null);
  }

  function cancelEditStop() {
    setEditingStopId(null);
    setEditPosition(null);
    setStopError(null);
  }

  async function handleSaveStop() {
    if (!editingStopId || !editPosition) return;
    setIsSavingStop(true);
    setStopError(null);
    try {
      await adminQueries.updateStop(supabase, editingStopId, {
        name: editStopName,
        lat: editPosition.lat,
        lng: editPosition.lng,
        scheduled_time: editScheduledTime || null
      });
      cancelEditStop();
      await refetch();
    } catch (err) {
      setStopError(err instanceof Error ? err.message : "Failed to save stop");
    } finally {
      setIsSavingStop(false);
    }
  }

  async function handleDeleteStop(stopId: string) {
    setIsDeletingStop(true);
    setStopError(null);
    try {
      await adminQueries.deleteStop(supabase, stopId);
      // Keep sequence_no contiguous (1..N) so a future "add stop" (which numbers
      // off the current max) never collides with a gap left by this deletion.
      const remaining = stops.filter((s) => s.id !== stopId).sort((a, b) => a.sequence_no - b.sequence_no);
      for (const [i, s] of remaining.entries()) {
        const desired = i + 1;
        if (s.sequence_no !== desired) {
          await adminQueries.updateStop(supabase, s.id, { sequence_no: desired });
        }
      }
      setConfirmingDeleteStopId(null);
      await refetch();
    } catch (err) {
      setStopError(err instanceof Error ? err.message : "Failed to delete stop");
    } finally {
      setIsDeletingStop(false);
    }
  }

  async function handleMoveStop(stop: StopRow, direction: "up" | "down") {
    const sorted = [...stops].sort((a, b) => a.sequence_no - b.sequence_no);
    const index = sorted.findIndex((s) => s.id === stop.id);
    const swapWith = direction === "up" ? sorted[index - 1] : sorted[index + 1];
    if (!swapWith) return;
    setIsReordering(true);
    setStopError(null);
    try {
      // (route_id, sequence_no) is unique -- swap via a temporary out-of-range
      // value first so the two intermediate writes never collide.
      await adminQueries.updateStop(supabase, stop.id, { sequence_no: -1 });
      await adminQueries.updateStop(supabase, swapWith.id, { sequence_no: stop.sequence_no });
      await adminQueries.updateStop(supabase, stop.id, { sequence_no: swapWith.sequence_no });
      await refetch();
    } catch (err) {
      setStopError(err instanceof Error ? err.message : "Failed to reorder stops");
    } finally {
      setIsReordering(false);
    }
  }

  const sortedStops = [...stops].sort((a, b) => a.sequence_no - b.sequence_no);
  const markerPoints: MapPoint[] = [
    // While a stop is being edited, its stale pre-edit position is dropped
    // in favor of editPosition -- otherwise the same stop would show two
    // markers (its old spot and the new one) until Save.
    ...stops.filter((s) => s.id !== editingStopId).map((s) => ({ lat: s.lat, lng: s.lng })),
    ...(pendingPoint ? [pendingPoint] : []),
    ...(editPosition ? [editPosition] : [])
  ];

  return (
    <AdminShell>
      {isEditingRoute ? (
        <Card className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Route name</span>
            <input
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Direction</span>
            <select
              value={routeDirection}
              onChange={(e) => setRouteDirection(e.target.value as "pickup" | "dropoff")}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="pickup">Pickup</option>
              <option value="dropoff">Dropoff</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button disabled={isSavingRoute || !routeName} onClick={handleSaveRoute}>
              {isSavingRoute ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setIsEditingRoute(false)}>
              Cancel
            </Button>
          </div>
          {routeError ? <p className="text-sm text-critical-600">{routeError}</p> : null}
        </Card>
      ) : (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-brand-800">{route?.name ?? "Route"}</h1>
            <p className="text-neutral-500">{route?.direction}</p>
          </div>
          <Button variant="secondary" onClick={startEditRoute}>
            Edit route
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-medium">Stops</h2>
            {stopError ? <p className="mb-2 text-sm text-critical-600">{stopError}</p> : null}
            <ol className="flex flex-col gap-2">
              {sortedStops.map((s, i) => (
                <li key={s.id} className="border-b border-neutral-100 pb-2 last:border-0">
                  {editingStopId === s.id ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-neutral-500">
                        {editPosition?.lat.toFixed(5)}, {editPosition?.lng.toFixed(5)} — search an address or click the
                        map to move this stop
                      </p>
                      <input
                        value={editStopName}
                        onChange={(e) => setEditStopName(e.target.value)}
                        placeholder="Stop name"
                        className="min-h-control rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      />
                      <input
                        type="time"
                        value={editScheduledTime}
                        onChange={(e) => setEditScheduledTime(e.target.value)}
                        className="min-h-control rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <Button disabled={isSavingStop || !editStopName} onClick={handleSaveStop}>
                          {isSavingStop ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="ghost" onClick={cancelEditStop}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : confirmingDeleteStopId === s.id ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-neutral-500">Delete &quot;{s.name}&quot;?</span>
                      <Button variant="secondary" disabled={isDeletingStop} onClick={() => handleDeleteStop(s.id)}>
                        {isDeletingStop ? "Deleting..." : "Confirm"}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmingDeleteStopId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-medium">{s.sequence_no}.</span> {s.name}
                        {s.scheduled_time ? <span className="text-neutral-500"> — {s.scheduled_time}</span> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isReordering || i === 0}
                          onClick={() => handleMoveStop(s, "up")}
                          className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={isReordering || i === sortedStops.length - 1}
                          onClick={() => handleMoveStop(s, "down")}
                          className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditStop(s)}
                          className="rounded px-1.5 py-0.5 text-sm text-brand-700 hover:bg-neutral-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteStopId(s.id)}
                          className="rounded px-1.5 py-0.5 text-sm text-critical-600 hover:bg-neutral-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {stops.length === 0 ? <p className="text-sm text-neutral-500">No stops yet.</p> : null}
            </ol>
          </Card>

          {!editingStopId ? (
            <Card className="flex flex-col gap-3">
              <h2 className="font-medium">Add a stop</h2>
              <AddressSearch
                placeholder="Search an address for this stop…"
                onSelect={(r) => {
                  setPendingPoint({ lat: r.lat, lng: r.lng });
                  setPanTo({ lat: r.lat, lng: r.lng });
                }}
              />
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
                <p className="text-sm text-neutral-500">Search an address above, or click the map, to place a stop.</p>
              )}
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {editingStopId ? (
            <AddressSearch
              placeholder="Search an address to move this stop…"
              onSelect={(r) => {
                setEditPosition({ lat: r.lat, lng: r.lng });
                setPanTo({ lat: r.lat, lng: r.lng });
              }}
            />
          ) : null}
          <div className="h-[28rem] overflow-hidden rounded-2xl border border-neutral-200">
            <ClickToAddMap
              points={markerPoints}
              center={route?.polyline?.[0]}
              onAddPoint={(p) => (editingStopId ? setEditPosition(p) : setPendingPoint(p))}
              panTo={panTo}
            />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
