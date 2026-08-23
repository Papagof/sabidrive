"use client";

import { useEffect, useState } from "react";
import { useSupabaseClient } from "../context";

export interface TripPoint {
  lat: number;
  lng: number;
  headingDeg: number | null;
  speedKmh: number | null;
  recordedAt: string;
  /** 'gps' (driver/attendant phone) or 'manual' (admin last-resort override) -- see 0032_manual_trip_location.sql. */
  source: "gps" | "manual";
}

export interface TripLocationState {
  /** Most recent confirmed position from the simulator/GPS feed. */
  current: TripPoint | null;
  /** Position immediately prior, useful for client-side lerp/animation. */
  previous: TripPoint | null;
}

function toTripPoint(row: Record<string, unknown>): TripPoint {
  return {
    lat: row.lat as number,
    lng: row.lng as number,
    headingDeg: (row.heading_deg as number | null) ?? null,
    speedKmh: (row.speed_kmh as number | null) ?? null,
    recordedAt: row.recorded_at as string,
    source: (row.source as "gps" | "manual" | undefined) ?? "gps"
  };
}

/** Live position for a single trip, updated via Supabase Realtime. */
export function useTripLocation(tripId: string | null): TripLocationState {
  const supabase = useSupabaseClient();
  const [state, setState] = useState<TripLocationState>({ current: null, previous: null });

  useEffect(() => {
    if (!tripId) {
      setState({ current: null, previous: null });
      return;
    }

    let isMounted = true;

    supabase
      .from("trip_locations")
      .select("*")
      .eq("trip_id", tripId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (isMounted && data && data[0]) {
          setState({ current: toTripPoint(data[0]), previous: null });
        }
      });

    const channel = supabase
      .channel(`trip-location-${tripId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trip_locations", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setState((prev) => ({
            current: toTripPoint(payload.new as Record<string, unknown>),
            previous: prev.current
          }));
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, tripId]);

  return state;
}
