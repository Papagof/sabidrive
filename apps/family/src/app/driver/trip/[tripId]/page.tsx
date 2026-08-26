"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, Button, Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import { tripQueries, useSupabaseClient, useTripMessages } from "@sabidrive/supabase";
import { useRequireRole } from "@/lib/useRequireRole";
import { useLiveLocationSharing } from "@/lib/useLiveLocationSharing";

const LOCATION_STATUS_LABEL: Record<string, string> = {
  idle: "Starting location sharing…",
  requesting: "Getting location permission…",
  sharing: "Sharing live location",
  unsupported: "Live location isn't supported on this device",
  denied: "Location access denied",
  error: "Couldn't share live location"
};

interface AttendanceRow {
  id: string;
  student_id: string;
  status: string;
  students: { first_name: string; last_name: string } | null;
}

export default function DriverTripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { profile, isLoading: isAuthLoading } = useRequireRole(["driver"]);
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sosStep, setSosStep] = useState<"idle" | "confirm" | "sending" | "sent">("idle");
  const [sosError, setSosError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const { status: locationStatus, errorMessage: locationError } = useLiveLocationSharing(tripId);
  const { messages, sendMessage } = useTripMessages(tripId);

  async function refetch() {
    const data = await tripQueries.getAttendanceForTrip(supabase, tripId);
    setAttendance(data as unknown as AttendanceRow[]);
  }

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(`driver-trip-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_expectations", filter: `trip_id=eq.${tripId}` },
        () => void refetch()
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tripId]);

  async function handleConfirmSos() {
    setSosStep("sending");
    setSosError(null);
    try {
      await tripQueries.triggerSos(supabase, tripId);
      setSosStep("sent");
    } catch (err) {
      setSosError(err instanceof Error ? err.message : "Failed to send SOS alert");
      setSosStep("confirm");
    }
  }

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    const body = messageDraft.trim();
    if (!body) return;
    setMessageDraft("");
    await sendMessage(body);
  }

  async function handleEndTrip() {
    setIsEnding(true);
    setError(null);
    try {
      await tripQueries.endTrip(supabase, tripId);
      router.push("/driver");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end trip");
    } finally {
      setIsEnding(false);
    }
  }

  if (isAuthLoading) return null;

  const boardedCount = attendance.filter((a) => a.status === "boarded").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold text-brand-800">Trip in progress</h1>
      <p className="text-neutral-600">
        {boardedCount} of {attendance.length} students boarded
      </p>

      {sosStep === "sent" ? (
        <div className="flex flex-col gap-2">
          <Banner tone="critical" title="Emergency alert sent">
            Your school and the guardians of students on this trip have been notified.
          </Banner>
          <Button variant="ghost" className="self-start" onClick={() => setSosStep("idle")}>
            Send another alert
          </Button>
        </div>
      ) : sosStep === "confirm" || sosStep === "sending" ? (
        <Banner tone="critical" title="Send an emergency alert?">
          This immediately notifies your school&apos;s admins and every guardian on this trip. Only use this for a
          real emergency.
          <div className="mt-3 flex gap-2">
            <Button variant="sos" onClick={handleConfirmSos} disabled={sosStep === "sending"}>
              {sosStep === "sending" ? "Sending..." : "Confirm SOS"}
            </Button>
            <Button variant="ghost" onClick={() => setSosStep("idle")} disabled={sosStep === "sending"}>
              Cancel
            </Button>
          </div>
        </Banner>
      ) : (
        <Button variant="sos" size="lg" onClick={() => setSosStep("confirm")}>
          SOS — Emergency alert
        </Button>
      )}
      {sosError ? <p className="text-sm text-critical-600">{sosError}</p> : null}

      <StatusPill
        label={LOCATION_STATUS_LABEL[locationStatus] ?? locationStatus}
        tone={locationStatus === "sharing" ? "positive" : locationStatus === "denied" || locationStatus === "error" ? "caution" : "neutral"}
      />
      {locationStatus === "denied" ? (
        <Banner tone="caution" title="Turn on location access to share your live position">
          Parents and the school can still see the trip and attendance without it &mdash; you can keep scanning students and end the trip normally.
        </Banner>
      ) : locationStatus === "error" && locationError ? (
        <Banner tone="caution" title="Live location isn't sharing right now">
          {locationError}
        </Banner>
      ) : null}

      <Button size="lg" onClick={() => router.push(`/driver/trip/${tripId}/scan`)}>
        Scan student
      </Button>
      <Card className="flex flex-col gap-2">
        {attendance.map((row) => (
          <div key={row.id} className="flex items-center justify-between border-b border-neutral-100 py-2 last:border-0">
            <span>
              {row.students?.first_name} {row.students?.last_name}
            </span>
            <StatusPill label={row.status} tone={statusToneMap[row.status] ?? "neutral"} />
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-2">
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
            placeholder="Message guardians on this trip…"
            className="min-h-control flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
          />
          <Button type="submit" disabled={!messageDraft.trim()}>
            Send
          </Button>
        </form>
      </Card>

      {error ? <p className="text-sm text-critical-600">{error}</p> : null}
      <Button variant="secondary" size="lg" onClick={handleEndTrip} disabled={isEnding}>
        {isEnding ? "Ending trip..." : "End Trip"}
      </Button>
    </main>
  );
}
