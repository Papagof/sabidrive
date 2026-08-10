"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Card, StatusPill } from "@tripme/ui";
import type { FleetBusMarker } from "@tripme/ui";
import { useFleetTrips } from "@tripme/supabase";

const FleetMap = dynamic(() => import("@tripme/ui").then((m) => m.FleetMap), { ssr: false });

export default function DashboardPage() {
  const { isLoading } = useRequireAdmin();
  const { trips, latestByTrip } = useFleetTrips();

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
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Fleet map</h1>
      <div className="mb-6 h-96 overflow-hidden rounded-2xl border border-neutral-200">
        <FleetMap buses={buses} />
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
