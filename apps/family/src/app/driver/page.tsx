"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, StatusPill, statusToneMap } from "@tripme/ui";
import { tripQueries, useSupabaseClient } from "@tripme/supabase";
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
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    tripQueries.getDriverBus(supabase, profile.id).then((data) => setBus(data as unknown as DriverBus));
  }, [supabase, profile]);

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

  if (isLoading || !bus) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Loading your bus…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold text-brand-800">Hi, {profile?.full_name}</h1>
      {profile ? <NotificationOptIn userId={profile.id} /> : null}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{bus.label}</h2>
          <StatusPill label={bus.status} tone={statusToneMap[bus.status] ?? "neutral"} />
        </div>
        <p className="text-neutral-600">{bus.routes?.name ?? "No route assigned"}</p>
        {error ? <p className="text-sm text-critical-600">{error}</p> : null}
        {bus.current_trip_id ? (
          <Button size="lg" onClick={() => router.push(`/driver/trip/${bus.current_trip_id}`)}>
            Resume trip
          </Button>
        ) : (
          <Button size="lg" onClick={handleStartTrip} disabled={isStarting || !bus.routes}>
            {isStarting ? "Starting..." : "Start Trip"}
          </Button>
        )}
      </Card>
    </main>
  );
}
