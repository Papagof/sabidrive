"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Banner, Button, Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import type { MapStop } from "@sabidrive/ui";
import { studentQueries, tripQueries, userQueries, useNotifications, useSupabaseClient, useTripLocation } from "@sabidrive/supabase";
import { useRequireGuardianAccess } from "@/lib/useRequireRole";

const TripMap = dynamic(() => import("@sabidrive/ui").then((m) => m.TripMap), { ssr: false });

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  default_route_id: string | null;
  default_stop_id: string | null;
}

interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface DriverContact {
  bus_id: string;
  buses: {
    label: string;
    driver: { full_name: string; phone: string | null; verification_status: string | null } | null;
  } | null;
}

export default function StudentTrackingPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { profile, isLoading: isAuthLoading } = useRequireGuardianAccess();
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [student, setStudent] = useState<Student | null>(null);
  const [stop, setStop] = useState<Stop | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [driverContact, setDriverContact] = useState<DriverContact | null>(null);
  const [pendingCodeType, setPendingCodeType] = useState<"board" | "alight" | null>(null);
  const [codeStatus, setCodeStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [codeCooldown, setCodeCooldown] = useState<"board" | "alight" | null>(null);

  const { current } = useTripLocation(tripId);
  const { notifications } = useNotifications(profile?.id ?? null);
  const studentNotifications = notifications.filter((n) => n.related_student_id === studentId);

  useEffect(() => {
    supabase
      .from("students")
      .select("id, first_name, last_name, default_route_id, default_stop_id")
      .eq("id", studentId)
      .single()
      .then(({ data }) => setStudent(data as Student | null));
  }, [supabase, studentId]);

  useEffect(() => {
    if (!student?.default_stop_id) return;
    supabase
      .from("stops")
      .select("id, name, lat, lng")
      .eq("id", student.default_stop_id)
      .single()
      .then(({ data }) => setStop(data as Stop | null));
  }, [supabase, student?.default_stop_id]);

  useEffect(() => {
    if (!student?.default_route_id) return;
    studentQueries.getActiveTripForRoute(supabase, student.default_route_id).then((trip) => setTripId((trip as { id: string } | null)?.id ?? null));
  }, [supabase, student?.default_route_id]);

  useEffect(() => {
    if (!tripId) {
      setDriverContact(null);
      return;
    }
    tripQueries.getTripWithDriverContact(supabase, tripId).then((data) => setDriverContact(data as unknown as DriverContact));
  }, [supabase, tripId]);

  useEffect(() => {
    if (!tripId || !student?.default_stop_id) return;
    const activeTripId = tripId;
    const activeStopId = student.default_stop_id;

    async function loadEta() {
      const { data } = await supabase
        .from("trip_stop_etas")
        .select("eta_minutes")
        .eq("trip_id", activeTripId)
        .eq("stop_id", activeStopId)
        .maybeSingle();
      setEtaMinutes((data?.eta_minutes as number | undefined) ?? null);
    }
    void loadEta();

    const channel = supabase
      .channel(`eta-${activeTripId}-${activeStopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_stop_etas", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const row = payload.new as { stop_id: string; eta_minutes: number };
          if (row.stop_id === student.default_stop_id) setEtaMinutes(row.eta_minutes);
        }
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [supabase, tripId, student?.default_stop_id]);

  async function handleRequestCode(eventType: "board" | "alight") {
    setPendingCodeType(eventType);
    setCodeStatus(null);
    try {
      await userQueries.requestPickupCode(supabase, studentId, eventType);
      setCodeStatus({ kind: "success", message: "Code sent — give it to the driver when the bus arrives." });
      setCodeCooldown(eventType);
      setTimeout(() => setCodeCooldown(null), 30_000);
    } catch (err) {
      setCodeStatus({ kind: "error", message: err instanceof Error ? err.message : "Failed to send code" });
    } finally {
      setPendingCodeType(null);
    }
  }

  if (isAuthLoading || !student) return null;

  const driver = driverContact?.buses?.driver;
  const stops: MapStop[] = stop ? [stop] : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <button onClick={() => router.push("/parent")} className="self-start text-sm text-brand-700">
        ← All children
      </button>
      <h1 className="text-2xl font-semibold text-brand-800">
        {student.first_name} {student.last_name}
      </h1>

      {tripId ? (
        <>
          <div className="h-64 overflow-hidden rounded-2xl border border-neutral-200">
            <TripMap busPosition={current ? { lat: current.lat, lng: current.lng } : null} stops={stops} highlightStopId={stop?.id} />
          </div>
          <Banner tone="info" title={etaMinutes != null ? `Arriving in about ${etaMinutes} min` : "Tracking bus…"} />
        </>
      ) : (
        <Card>
          <p className="text-neutral-600">No active trip right now. You&apos;ll be notified when the bus starts its route.</p>
        </Card>
      )}

      {driver ? (
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-500">Driver</p>
            <div className="flex items-center gap-2">
              <p className="font-medium">{driver.full_name}</p>
              <StatusPill
                label={driver.verification_status ?? "pending"}
                tone={statusToneMap[driver.verification_status ?? "pending"] ?? "neutral"}
              />
            </div>
          </div>
          {driver.phone ? (
            <a href={`tel:${driver.phone}`}>
              <Button variant="secondary">Call driver</Button>
            </a>
          ) : null}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <div>
          <p className="font-medium">Home pickup / drop-off code</p>
          <p className="text-sm text-neutral-500">
            Get a one-time code texted to your phone, then give it to the driver instead of a QR scan when they arrive at
            home.
          </p>
        </div>
        {profile && !profile.phone_verified ? (
          <Banner tone="caution" title="Verify your phone number to use this">
            <Link href="/account" className="underline">
              Go to Account
            </Link>
          </Banner>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={pendingCodeType !== null || codeCooldown === "board"}
              onClick={() => handleRequestCode("board")}
            >
              {pendingCodeType === "board" ? "Sending..." : codeCooldown === "board" ? "Code sent" : "Text pickup code"}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={pendingCodeType !== null || codeCooldown === "alight"}
              onClick={() => handleRequestCode("alight")}
            >
              {pendingCodeType === "alight" ? "Sending..." : codeCooldown === "alight" ? "Code sent" : "Text drop-off code"}
            </Button>
          </div>
        )}
        {codeStatus ? <Banner tone={codeStatus.kind === "success" ? "info" : "caution"} title={codeStatus.message} /> : null}
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-medium">Today&apos;s timeline</h2>
        <Card className="flex flex-col gap-2">
          {studentNotifications.length === 0 ? (
            <p className="text-sm text-neutral-500">No notifications yet today.</p>
          ) : (
            studentNotifications.map((n) => (
              <div key={n.id} className="flex flex-col border-b border-neutral-100 py-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{n.title}</span>
                  <StatusPill label={new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tone="neutral" />
                </div>
                {n.body ? <span className="text-sm text-neutral-600">{n.body}</span> : null}
              </div>
            ))
          )}
        </Card>
      </div>
    </main>
  );
}
