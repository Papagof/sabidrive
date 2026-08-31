"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import { buildRouteManifest, tripQueries, useSupabaseClient, type RouteManifest } from "@sabidrive/supabase";
import { useRequireRole } from "@/lib/useRequireRole";
import { NotificationOptIn } from "@/components/NotificationOptIn";

interface DriverBus {
  id: string;
  label: string;
  status: string;
  current_trip_id: string | null;
  routes: { id: string; name: string } | null;
}

export default function DriverHomePage() {
  const { profile, isLoading } = useRequireRole(["driver"]);
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [bus, setBus] = useState<DriverBus | null>(null);
  const [isBusLoading, setIsBusLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<RouteManifest | null>(null);

  useEffect(() => {
    if (!profile) return;
    tripQueries
      .getDriverBus(supabase, profile.id)
      .then((data) => setBus(data as unknown as DriverBus))
      .finally(() => setIsBusLoading(false));
  }, [supabase, profile]);

  useEffect(() => {
    if (!bus?.routes?.id) {
      setManifest(null);
      return;
    }
    tripQueries.getRouteManifest(supabase, bus.routes.id).then(({ stops, students }) => {
      setManifest(buildRouteManifest(stops, students));
    });
  }, [supabase, bus?.routes?.id]);

  async function handleStartTrip() {
    if (!bus) return;
    setIsStarting(true);
    setError(null);
    try {
      const tripId = await tripQueries.startTrip(supabase, bus.id, "pickup");
      router.push(`/driver/trip/${tripId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start trip");
    } finally {
      setIsStarting(false);
    }
  }

  if (isLoading || isBusLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Loading your bus…</p>
      </main>
    );
  }

  if (!bus) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-brand-800">No bus assigned yet</h1>
        <p className="text-neutral-600">
          Your school admin hasn&apos;t assigned you to a bus yet. Check back once they&apos;ve set you up on
          the Buses page.
        </p>
        <button
          className="text-sm text-neutral-500 hover:text-neutral-800"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold text-brand-800">Hi, {profile?.full_name}</h1>
        <div className="flex items-center gap-3">
          <Link href="/account" className="text-sm text-brand-700">
            Account
          </Link>
          <button
            className="text-sm text-neutral-500 hover:text-neutral-800"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      {profile ? <NotificationOptIn userId={profile.id} /> : null}
      <Card className="flex flex-col gap-3 print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{bus.label}</h2>
          <StatusPill label={bus.status} tone={statusToneMap[bus.status] ?? "neutral"} />
        </div>
        <p className="text-neutral-600">{bus.routes?.name ?? "No route assigned"}</p>
      </Card>

      {manifest ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Today&apos;s Route</h2>
            <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
              Print manifest
            </Button>
          </div>
          <p className="hidden text-sm text-neutral-600 print:block">
            {bus.label} · {bus.routes?.name ?? "No route assigned"} · {new Date().toLocaleDateString()}
          </p>
          {manifest.stops.length === 0 ? (
            <p className="text-sm text-neutral-500">No stops on this route yet.</p>
          ) : (
            manifest.stops.map((stop) => (
              <div key={stop.stopId} className="border-b border-neutral-100 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {stop.sequenceNo}. {stop.name}
                  </p>
                  <span className="text-sm text-neutral-500">
                    {stop.scheduledTime ?? ""} · {stop.students.length} student{stop.students.length === 1 ? "" : "s"}
                  </span>
                </div>
                {stop.students.length > 0 ? (
                  <p className="text-sm text-neutral-600">
                    {stop.students.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}
                  </p>
                ) : null}
              </div>
            ))
          )}
          {manifest.unassignedStudents.length > 0 ? (
            <div>
              <p className="font-medium text-caution-700">Unassigned</p>
              <p className="text-sm text-neutral-600">
                {manifest.unassignedStudents.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {error ? <p className="text-sm text-critical-600 print:hidden">{error}</p> : null}
      {bus.current_trip_id ? (
        <Button size="lg" className="print:hidden" onClick={() => router.push(`/driver/trip/${bus.current_trip_id}`)}>
          Resume trip
        </Button>
      ) : (
        <Button size="lg" className="print:hidden" onClick={handleStartTrip} disabled={isStarting || !bus.routes}>
          {isStarting ? "Starting..." : "Start Trip"}
        </Button>
      )}
    </main>
  );
}
