"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Card, StatusPill } from "@sabidrive/ui";
import type { FleetBusMarker, MapPoint } from "@sabidrive/ui";
import { adminQueries, summarizeAttendance, useFleetTrips, useSupabaseClient, type AttendanceSummary } from "@sabidrive/supabase";

const FleetMap = dynamic(() => import("@sabidrive/ui").then((m) => m.FleetMap), { ssr: false });

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const { trips, latestByTrip } = useFleetTrips();
  const [schoolAddress, setSchoolAddress] = useState<string | null>(null);
  const [schoolCenter, setSchoolCenter] = useState<MapPoint | undefined>(undefined);
  const [openAlerts, setOpenAlerts] = useState<{ severity: string }[] | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);

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

  useEffect(() => {
    if (!profile?.school_id) return;
    adminQueries.getOpenAlerts(supabase, profile.school_id).then(setOpenAlerts);
    adminQueries
      .getTodaysAttendance(supabase, profile.school_id, todayISODate())
      .then((rows) => setAttendanceSummary(summarizeAttendance(rows)));
  }, [supabase, profile?.school_id]);

  if (isLoading) return null;

  const openAlertsCount = openAlerts?.length ?? 0;
  const hasCriticalOpenAlert = openAlerts?.some((a) => a.severity === "critical") ?? false;

  const buses: FleetBusMarker[] = trips
    .filter((t) => latestByTrip[t.id])
    .map((t) => ({
      tripId: t.id,
      label: t.buses?.label ?? "Bus",
      position: { lat: latestByTrip[t.id]!.lat, lng: latestByTrip[t.id]!.lng }
    }));

  return (
    <AdminShell>
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-neutral-600">Open alerts</h2>
          {openAlerts === null ? (
            <p className="text-neutral-500">Loading…</p>
          ) : openAlertsCount === 0 ? (
            <p className="text-xl font-semibold text-calm-700">All clear</p>
          ) : (
            <>
              <p className={`text-xl font-semibold ${hasCriticalOpenAlert ? "text-critical-600" : "text-caution-700"}`}>
                {openAlertsCount} unresolved
              </p>
              <Link href="/alerts" className="text-sm text-brand-700">
                Review alerts →
              </Link>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-neutral-600">Today&apos;s attendance</h2>
          {attendanceSummary === null ? (
            <p className="text-neutral-500">Loading…</p>
          ) : attendanceSummary.total === 0 ? (
            <p className="text-neutral-500">No trips today yet.</p>
          ) : (
            <p className={`text-xl font-semibold ${attendanceSummary.missed > 0 ? "text-caution-700" : "text-calm-700"}`}>
              {attendanceSummary.boarded}/{attendanceSummary.total} boarded
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-neutral-600">Active trips right now</h2>
          <p className="text-xl font-semibold text-brand-700">{trips.length}</p>
        </Card>
      </div>

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
