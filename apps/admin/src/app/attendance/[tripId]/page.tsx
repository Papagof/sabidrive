"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Banner, Button, Card, StatusPill, statusToneMap, AddressSearch } from "@sabidrive/ui";
import type { MapPoint } from "@sabidrive/ui";
import { tripQueries, useStaleness, useSupabaseClient, useTripLocation, useTripMessages } from "@sabidrive/supabase";

const TripMap = dynamic(() => import("@sabidrive/ui").then((m) => m.TripMap), { ssr: false });
const ClickToAddMap = dynamic(() => import("@sabidrive/ui").then((m) => m.ClickToAddMap), { ssr: false });

interface AttendanceRow {
  id: string;
  status: string;
  students: { first_name: string; last_name: string } | null;
}

interface TripInfo {
  id: string;
  status: string;
  buses: { label: string } | null;
}

export default function AttendancePage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [trip, setTrip] = useState<TripInfo | null>(null);

  const [isOverriding, setIsOverriding] = useState(false);
  const [overridePoint, setOverridePoint] = useState<MapPoint | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");

  const { current } = useTripLocation(tripId);
  const { isStale, secondsAgo } = useStaleness(current?.recordedAt ?? null);
  const { messages, sendMessage } = useTripMessages(tripId);

  async function refetch() {
    const data = await tripQueries.getAttendanceForTrip(supabase, tripId);
    setAttendance(data as unknown as AttendanceRow[]);
    const { data: tripData } = await supabase
      .from("trips")
      .select("id, status, buses!trips_bus_id_fkey(label)")
      .eq("id", tripId)
      .single();
    setTrip(tripData as unknown as TripInfo | null);
  }

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(`admin-attendance-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_expectations", filter: `trip_id=eq.${tripId}` },
        () => void refetch()
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tripId]);

  if (isLoading) return null;

  const boarded = attendance.filter((a) => a.status === "boarded").length;
  const missed = attendance.filter((a) => a.status === "missed").length;
  const pending = attendance.filter((a) => a.status === "pending").length;

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    const body = messageDraft.trim();
    if (!body) return;
    setMessageDraft("");
    await sendMessage(body);
  }

  async function handleSaveOverride() {
    if (!overridePoint) return;
    setIsSavingOverride(true);
    setOverrideError(null);
    try {
      await tripQueries.recordManualTripLocation(supabase, tripId, overridePoint.lat, overridePoint.lng);
      setOverrideStatus("Position updated.");
      setOverridePoint(null);
      setIsOverriding(false);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : "Failed to update position");
    } finally {
      setIsSavingOverride(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">{trip?.buses?.label ?? "Trip"}</h1>
      <p className="mb-4 text-neutral-600">
        {boarded} boarded · {pending} pending · {missed} missed
      </p>

      <div className="mb-4 h-72 overflow-hidden rounded-2xl border border-neutral-200">
        <TripMap busPosition={current ? { lat: current.lat, lng: current.lng } : null} />
      </div>

      {current?.source === "manual" ? (
        <Banner tone="caution" title="This position was set manually by an admin, not GPS" className="mb-4" />
      ) : isStale && secondsAgo != null ? (
        <Banner tone="caution" title={`Location last updated ${Math.round(secondsAgo / 60) || 1} min ago`} className="mb-4">
          No GPS update has come in for a while — the driver&apos;s (or backup driver&apos;s) phone may be off or out of signal.
        </Banner>
      ) : null}

      {trip?.status === "in_progress" ? (
        <Card className="mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Manually update position</p>
              <p className="text-sm text-neutral-500">
                Last resort if every phone on the bus is unreachable — e.g. after a phone call from the driver.
              </p>
            </div>
            {!isOverriding ? (
              <Button variant="ghost" onClick={() => setIsOverriding(true)}>
                Set position
              </Button>
            ) : null}
          </div>

          {isOverriding ? (
            <div className="flex flex-col gap-2">
              <AddressSearch
                placeholder="Search an address for the bus's current position…"
                onSelect={(r) => setOverridePoint({ lat: r.lat, lng: r.lng })}
              />
              <div className="h-64 overflow-hidden rounded-xl border border-neutral-200">
                <ClickToAddMap
                  points={overridePoint ? [overridePoint] : []}
                  onAddPoint={(p) => setOverridePoint(p)}
                  center={current ? { lat: current.lat, lng: current.lng } : undefined}
                  panTo={overridePoint}
                />
              </div>
              {overrideError ? <p className="text-sm text-critical-600">{overrideError}</p> : null}
              <div className="flex gap-2">
                <Button onClick={handleSaveOverride} disabled={!overridePoint || isSavingOverride} className="flex-1">
                  {isSavingOverride ? "Saving..." : "Confirm position"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsOverriding(false);
                    setOverridePoint(null);
                    setOverrideError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {overrideStatus && !isOverriding ? <p className="text-sm text-calm-700">{overrideStatus}</p> : null}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-2">
        {attendance.map((row) => (
          <div key={row.id} className="flex items-center justify-between border-b border-neutral-100 py-2 last:border-0">
            <span>
              {row.students?.first_name} {row.students?.last_name}
            </span>
            <StatusPill label={row.status} tone={statusToneMap[row.status] ?? "neutral"} />
          </div>
        ))}
        {attendance.length === 0 ? <p className="text-neutral-500">No expected students for this trip.</p> : null}
      </Card>

      <Card className="mt-4 flex flex-col gap-2">
        <h2 className="font-medium">Messages</h2>
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.senderId === profile?.id ? "self-end bg-brand-50 text-brand-900" : "self-start bg-neutral-100 text-neutral-800"
              }`}
            >
              <p className="text-xs font-medium text-neutral-500">{m.senderName}</p>
              <p>{m.body}</p>
            </div>
          ))}
          {messages.length === 0 ? <p className="text-sm text-neutral-500">No messages yet.</p> : null}
        </div>
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            placeholder="Message the driver and guardians on this trip…"
            className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
          />
          <Button type="submit" disabled={!messageDraft.trim()}>
            Send
          </Button>
        </form>
      </Card>
    </AdminShell>
  );
}
