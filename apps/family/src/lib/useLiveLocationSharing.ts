"use client";

import { useEffect, useRef, useState } from "react";
import { tripQueries, useSupabaseClient } from "@sabidrive/supabase";
import {
  computeEtaMinutes,
  cumulativeDistancesM,
  distanceToRouteM,
  enqueueLocationFix,
  projectPointOntoRoute,
  type LatLng,
  type QueuedLocationFix
} from "@sabidrive/gps-sim";

export type LiveLocationStatus = "idle" | "requesting" | "sharing" | "queued" | "unsupported" | "denied" | "error";

const MIN_UPDATE_INTERVAL_MS = 4000;
const MAX_QUEUE_SIZE = 100;

interface RouteGeometry {
  points: LatLng[];
  cumulative: number[];
  avgSpeedKmh: number;
  stops: { id: string; distanceAlongRouteM: number }[];
}

function queueStorageKey(tripId: string): string {
  return `sabidrive:pending-locations:${tripId}`;
}

function loadQueue(tripId: string): QueuedLocationFix[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(queueStorageKey(tripId));
    return raw ? (JSON.parse(raw) as QueuedLocationFix[]) : [];
  } catch {
    return [];
  }
}

function persistQueue(tripId: string, queue: QueuedLocationFix[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(queueStorageKey(tripId), JSON.stringify(queue));
  } catch {
    // Storage full/unavailable -- the queue still lives in memory for this session.
  }
}

/**
 * Reports the driver's real phone GPS position for an in-progress trip,
 * replacing packages/gps-sim's simulated ticker for this one trip (the
 * simulator itself is untouched -- it's still how a demo/dev trip without
 * a live driver moves). See 0027_live_driver_gps.sql for the RPC this
 * calls and why the route math happens here instead of in SQL.
 *
 * A driver who briefly loses network (tunnel, dead zone) doesn't silently
 * drop location fixes -- they queue locally (localStorage, so a
 * backgrounded/killed-and-relaunched app doesn't lose them either) and
 * replay in order once back online. Each replayed fix carries its true
 * original timestamp (p_recorded_at, 0035_record_trip_location_timestamp.sql)
 * so the trip's position history reflects reality, not replay time.
 */
export function useLiveLocationSharing(tripId: string) {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<LiveLocationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const lastSentAtRef = useRef(0);
  const geometryRef = useRef<RouteGeometry | null>(null);
  const queueRef = useRef<QueuedLocationFix[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    let watchId: number | null = null;

    queueRef.current = loadQueue(tripId);
    setQueuedCount(queueRef.current.length);

    function toInput(fix: QueuedLocationFix): Parameters<typeof tripQueries.recordTripLocation>[2] {
      return {
        lat: fix.lat,
        lng: fix.lng,
        headingDeg: fix.headingDeg,
        speedKmh: fix.speedKmh,
        deviationM: fix.deviationM,
        stopEtas: fix.stopEtas,
        recordedAt: fix.recordedAt
      };
    }

    /** Attempts to send every queued fix, oldest first, stopping at the first failure so order (and thus alert-relevant speed deltas) is preserved. */
    async function flushQueue(): Promise<void> {
      while (queueRef.current.length > 0) {
        const [next, ...rest] = queueRef.current;
        try {
          await tripQueries.recordTripLocation(supabase, tripId, toInput(next!));
          queueRef.current = rest;
          persistQueue(tripId, queueRef.current);
          if (!cancelled) setQueuedCount(queueRef.current.length);
        } catch {
          break;
        }
      }
    }

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

      const fix: QueuedLocationFix = {
        lat: here.lat,
        lng: here.lng,
        headingDeg: position.coords.heading ?? null,
        speedKmh,
        deviationM,
        stopEtas,
        recordedAt: new Date(now).toISOString()
      };

      await flushQueue();

      if (queueRef.current.length > 0) {
        // Already failing to reach the server -- queue this fix too rather than spending another failed request finding that out.
        queueRef.current = enqueueLocationFix(queueRef.current, fix, MAX_QUEUE_SIZE);
        persistQueue(tripId, queueRef.current);
        if (!cancelled) {
          setQueuedCount(queueRef.current.length);
          setStatus("queued");
        }
        return;
      }

      try {
        await tripQueries.recordTripLocation(supabase, tripId, toInput(fix));
        if (!cancelled) {
          setStatus("sharing");
          setErrorMessage(null);
        }
      } catch (err) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          queueRef.current = enqueueLocationFix(queueRef.current, fix, MAX_QUEUE_SIZE);
          persistQueue(tripId, queueRef.current);
          if (!cancelled) {
            setQueuedCount(queueRef.current.length);
            setStatus("queued");
          }
        } else if (!cancelled) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to report location");
        }
      }
    }

    function handleOnline() {
      void flushQueue().then(() => {
        if (!cancelled && queueRef.current.length === 0 && geometryRef.current) {
          setStatus("sharing");
        }
      });
    }
    window.addEventListener("online", handleOnline);

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
      window.removeEventListener("online", handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, supabase]);

  return { status, errorMessage, queuedCount };
}
