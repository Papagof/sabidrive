"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabaseClient } from "../context";
import type { TripPoint } from "./useTripLocation";

export interface FleetTripRow {
  id: string;
  bus_id: string;
  route_id: string;
  status: string;
  direction: string;
  started_at: string | null;
  buses: { label: string } | null;
  routes: { name: string } | null;
}

/**
 * All in-progress trips visible to the caller (RLS scopes this to the
 * admin's own school), with a live-updating map of latest position per trip
 * — the fleet-wide view for the admin app.
 */
export function useFleetTrips() {
  const supabase = useSupabaseClient();
  const [trips, setTrips] = useState<FleetTripRow[]>([]);
  const [latestByTrip, setLatestByTrip] = useState<Record<string, TripPoint>>({});

  const refetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from("trips")
      .select("id, bus_id, route_id, status, direction, started_at, buses!trips_bus_id_fkey(label), routes(name)")
      .eq("status", "in_progress")
      .order("started_at", { ascending: false });
    if (data) setTrips(data as unknown as FleetTripRow[]);
  }, [supabase]);

  useEffect(() => {
    void refetchTrips();

    const tripsChannel = supabase
      .channel("fleet-trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        void refetchTrips();
      })
      .subscribe();

    const locationsChannel = supabase
      .channel("fleet-trip-locations")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trip_locations" }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const tripId = row.trip_id as string;
        setLatestByTrip((prev) => ({
          ...prev,
          [tripId]: {
            lat: row.lat as number,
            lng: row.lng as number,
            headingDeg: (row.heading_deg as number | null) ?? null,
            speedKmh: (row.speed_kmh as number | null) ?? null,
            recordedAt: row.recorded_at as string,
            source: (row.source as "gps" | "manual" | undefined) ?? "gps"
          }
        }));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(tripsChannel);
      void supabase.removeChannel(locationsChannel);
    };
  }, [supabase, refetchTrips]);

  return { trips, latestByTrip, refetchTrips };
}
