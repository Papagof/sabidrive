"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
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
  on_time_threshold_minutes: number;
  logo_url: string | null;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

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
  const [onTimeThreshold, setOnTimeThreshold] = useState("5");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

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
      setOnTimeThreshold(String(s.on_time_threshold_minutes));
      setLogoUrl(s.logo_url);
    });
  }, [supabase, profile?.school_id]);

  if (isLoading) return null;

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !school) return;
    setLogoError(null);
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be under 2MB.");
      return;
    }
    setIsUploadingLogo(true);
    try {
      const path = `${school.id}/logo`;
      const { error: uploadError } = await supabase.storage
        .from("school-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("school-logos").getPublicUrl(path);
      await adminQueries.updateSchool(supabase, school.id, { logo_url: data.publicUrl });
      setLogoUrl(data.publicUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setIsUploadingLogo(false);
    }
  }

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
        geofence_radius_m: Number(geofenceRadius),
        on_time_threshold_minutes: Number(onTimeThreshold)
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
              <span className="text-sm font-medium text-neutral-700">School logo</span>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-12 w-12 rounded object-contain" />
                ) : (
                  <span className="text-sm text-neutral-500">No logo yet</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingLogo}
                  onChange={handleLogoChange}
                  className="text-sm"
                />
              </div>
              {isUploadingLogo ? <span className="text-xs text-neutral-500">Uploading…</span> : null}
              {logoError ? <span className="text-sm text-critical-600">{logoError}</span> : null}
              <span className="text-xs text-neutral-500">Shown across your school&apos;s pages in both apps. Under 2MB.</span>
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
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">On-time threshold (minutes)</span>
              <input
                type="number"
                min="1"
                value={onTimeThreshold}
                onChange={(e) => setOnTimeThreshold(e.target.value)}
                className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
              />
              <span className="text-xs text-neutral-500">
                How many minutes early/late still counts as on time, for Reports and parent trip history.
              </span>
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
