"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";
import { getCurrentPosition, GeoError } from "@/lib/geolocation";

interface SchoolRow {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_radius_m: number;
}

export default function SettingsPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("");
  const [geofenceLat, setGeofenceLat] = useState("");
  const [geofenceLng, setGeofenceLng] = useState("");
  const [geofenceRadius, setGeofenceRadius] = useState("300");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!profile?.school_id) return;
    adminQueries.getSchool(supabase, profile.school_id).then((data) => {
      const s = data as unknown as SchoolRow;
      setSchool(s);
      setName(s.name);
      setAddress(s.address ?? "");
      setTimezone(s.timezone);
      setGeofenceLat(s.geofence_lat != null ? String(s.geofence_lat) : "");
      setGeofenceLng(s.geofence_lng != null ? String(s.geofence_lng) : "");
      setGeofenceRadius(String(s.geofence_radius_m));
    });
  }, [supabase, profile?.school_id]);

  if (isLoading) return null;

  async function handleUseCurrentLocation() {
    setIsLocating(true);
    setStatus(null);
    try {
      const pos = await getCurrentPosition();
      setGeofenceLat(String(pos.lat));
      setGeofenceLng(String(pos.lng));
    } catch (err) {
      setStatus(err instanceof GeoError ? err.message : "Couldn't get your location.");
    } finally {
      setIsLocating(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!school) return;
    setIsSaving(true);
    setStatus(null);
    try {
      await adminQueries.updateSchool(supabase, school.id, {
        name,
        address,
        timezone,
        geofence_lat: geofenceLat ? Number(geofenceLat) : null,
        geofence_lng: geofenceLng ? Number(geofenceLng) : null,
        geofence_radius_m: Number(geofenceRadius)
      });
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">School settings</h1>
      <Card className="max-w-md">
        {school ? (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">School name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">Address</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Example Street, Lagos, Nigeria"
                className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">Timezone (IANA)</span>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/Chicago"
                className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">Geofence lat</span>
                <input
                  value={geofenceLat}
                  onChange={(e) => setGeofenceLat(e.target.value)}
                  className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">Geofence lng</span>
                <input
                  value={geofenceLng}
                  onChange={(e) => setGeofenceLng(e.target.value)}
                  className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                />
              </label>
            </div>
            <Button type="button" variant="secondary" disabled={isLocating} onClick={handleUseCurrentLocation}>
              {isLocating ? "Locating..." : "Use my current location"}
            </Button>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">Geofence radius (m)</span>
              <input
                value={geofenceRadius}
                onChange={(e) => setGeofenceRadius(e.target.value)}
                className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
              />
            </label>
            {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save school settings"}
            </Button>
          </form>
        ) : (
          <p className="text-neutral-500">Loading…</p>
        )}
      </Card>
    </AdminShell>
  );
}
