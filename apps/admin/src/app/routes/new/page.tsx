"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Banner, Button, Card } from "@tripme/ui";
import type { MapPoint } from "@tripme/ui";
import { adminQueries, useSupabaseClient } from "@tripme/supabase";

const ClickToAddMap = dynamic(() => import("@tripme/ui").then((m) => m.ClickToAddMap), { ssr: false });

export default function NewRoutePage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"pickup" | "dropoff">("pickup");
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) return null;

  async function handleSave() {
    if (!profile?.school_id) return;
    if (points.length < 2) {
      setError("Click at least two points on the map to draw the route path.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const route = await adminQueries.createRoute(supabase, {
        school_id: profile.school_id,
        name,
        direction,
        polyline: points
      });
      router.push(`/routes/${route.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create route");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">New route</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Route name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
              placeholder="Route 12 - Morning Pickup"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Direction</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "pickup" | "dropoff")}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="pickup">Pickup</option>
              <option value="dropoff">Dropoff</option>
            </select>
          </label>
          <Banner tone="info" title={`${points.length} point(s) on path`}>
            Click the map to add points along the road the bus will drive. Add at least two.
          </Banner>
          {points.length > 0 ? (
            <Button variant="secondary" onClick={() => setPoints((p) => p.slice(0, -1))}>
              Remove last point
            </Button>
          ) : null}
          {error ? <p className="text-sm text-critical-600">{error}</p> : null}
          <Button onClick={handleSave} disabled={isSaving || !name}>
            {isSaving ? "Saving..." : "Save route"}
          </Button>
        </Card>
        <div className="h-[28rem] overflow-hidden rounded-2xl border border-neutral-200">
          <ClickToAddMap points={points} onAddPoint={(p) => setPoints((prev) => [...prev, p])} />
        </div>
      </div>
    </AdminShell>
  );
}
