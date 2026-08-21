"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Card, StatusPill } from "@sabidrive/ui";
import type { FleetBusMarker, MapPoint } from "@sabidrive/ui";
import { adminQueries, useFleetTrips, useSupabaseClient } from "@sabidrive/supabase";

const FleetMap = dynamic(() => import("@sabidrive/ui").then((m) => m.FleetMap), { ssr: false });

export default function DashboardPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const { trips, latestByTrip } = useFleetTrips();
  const [schoolAddress, setSchoolAddress] = useState<string | null>(null);
  const [schoolCenter, setSchoolCenter] = useState<MapPoint | undefined>(undefined);

  useEffect(() => {
    if (!profile?.school_id) return;
    adminQueries.getSchool(supabase, profile.school_id).then((data) => {
      const school = data as unknown as { address: string | null; geofence_lat: number | null; geofence_lng: number | null };
      setSchoolAddress(school.address);
      if (school.geofence_lat != null && school.geofence_lng != null) {
        setSchoolCenter({ lat: school.geofence_lat, lng: school.geofence_lng });
      }
    });
  }, [supabase, profile?.school_id]);

  if (isLoading) return null;

  const buses: FleetBusMarker[] = trips
    .filter((t) => latestByTrip[t.id])
    .map((t) => ({
      tripId: t.id,
      label: t.buses?.label ?? "Bus",
      position: { lat: latestByTrip[t.id]!.lat, lng: latestByTrip[t.id]!.lng }
    }));

  return (
    <AdminShell>
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">Fleet map</h1>
      {schoolAddress ? <p className="mb-3 text-sm text-neutral-500">{schoolAddress}</p> : null}
      <div className="mb-6 h-96 overflow-hidden rounded-2xl border border-neutral-200">
        {/* School location is the resting-state center; an active bus still takes priority once there's one to show. */}
        <FleetMap buses={buses} center={buses.length === 0 ? schoolCenter : undefined} />
      </div>

      <h2 className="mb-2 text-lg font-medium">Active trips</h2>
      <div className="flex flex-col gap-2">
        {trips.length === 0 ? (
          <p className="text-neutral-500">No trips in progress right now.</p>
        ) : (
          trips.map((trip) => (
            <Link key={trip.id} href={`/attendance/${trip.id}`}>
              <Card className="flex items-center justify-between transition hover:border-brand-300">
                <div>
                  <p className="font-medium">{trip.buses?.label ?? "Bus"}</p>
                  <p className="text-sm text-neutral-500">{trip.routes?.name}</p>
                </div>
                <StatusPill label={trip.status} tone="info" />
              </Card>
            </Link>
          ))
        )}
      </div>
    </AdminShell>
  );
}
