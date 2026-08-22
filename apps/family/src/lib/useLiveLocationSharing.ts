"use client";

import { useEffect, useRef, useState } from "react";
import { tripQueries, useSupabaseClient } from "@sabidrive/supabase";
import { computeEtaMinutes, cumulativeDistancesM, distanceToRouteM, projectPointOntoRoute, type LatLng } from "@sabidrive/gps-sim";

export type LiveLocationStatus = "idle" | "requesting" | "sharing" | "unsupported" | "denied" | "error";

const MIN_UPDATE_INTERVAL_MS = 4000;

interface RouteGeometry {
  points: LatLng[];
  cumulative: number[];
  avgSpeedKmh: number;
  stops: { id: string; distanceAlongRouteM: number }[];
}

/**
 * Reports the driver's real phone GPS position for an in-progress trip,
 * replacing packages/gps-sim's simulated ticker for this one trip (the
 * simulator itself is untouched -- it's still how a demo/dev trip without
 * a live driver moves). See 0027_live_driver_gps.sql for the RPC this
 * calls and why the route math happens here instead of in SQL.
 */
export function useLiveLocationSharing(tripId: string) {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<LiveLocationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastSentAtRef = useRef(0);
  const geometryRef = useRef<RouteGeometry | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    let watchId: number | null = null;

    async function handleFix(position: GeolocationPosition) {
      const geometry = geometryRef.current;
      if (!geometry) return;
      const now = Date.now();
      if (now - lastSentAtRef.current < MIN_UPDATE_INTERVAL_MS) return;
      lastSentAtRef.current = now;

      const here: LatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
      const distanceAlongRouteM = projectPointOntoRoute(here, geometry.points, geometry.cumulative);
      const deviationM = distanceToRouteM(here, geometry.points, geometry.cumulative);
      const speedKmh = position.coords.speed != null && position.coords.speed >= 0 ? position.coords.speed * 3.6 : null;
      const effectiveSpeedKmh = speedKmh ?? geometry.avgSpeedKmh;

      const stopEtas = geometry.stops.map((stop) => ({
        stop_id: stop.id,
        eta_minutes: computeEtaMinutes(distanceAlongRouteM, stop.distanceAlongRouteM, effectiveSpeedKmh),
        distance_m: Math.max(0, stop.distanceAlongRouteM - distanceAlongRouteM)
      }));

      try {
        await tripQueries.recordTripLocation(supabase, tripId, {
          lat: here.lat,
          lng: here.lng,
          headingDeg: position.coords.heading ?? null,
          speedKmh,
          deviationM,
          stopEtas
        });
        if (!cancelled) {
          setStatus("sharing");
          setErrorMessage(null);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to report location");
        }
      }
    }

    async function start() {
      setStatus("requesting");
      try {
        const trip = await tripQueries.getTripRouteGeometry(supabase, tripId);
        if (cancelled) return;
        if (!trip.routes) {
          setStatus("error");
          setErrorMessage("This bus has no route assigned, so live location can't be shared.");
          return;
        }

        const points = trip.routes.polyline;
        const cumulative = cumulativeDistancesM(points);
        const stops = trip.routes.stops.map((s) => ({
          id: s.id,
          distanceAlongRouteM: projectPointOntoRoute({ lat: s.lat, lng: s.lng }, points, cumulative)
        }));
        geometryRef.current = { points, cumulative, avgSpeedKmh: trip.avg_speed_kmh, stops };

        watchId = navigator.geolocation.watchPosition(
          (position) => void handleFix(position),
          (err) => {
            if (cancelled) return;
            setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
            setErrorMessage(err.message || "Couldn't read location");
          },
          { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
        );
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to load route");
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, supabase]);

  return { status, errorMessage };
}
