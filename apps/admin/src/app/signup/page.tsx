"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banner, Button, Card } from "@sabidrive/ui";
import { schoolQueries, useSupabaseClient } from "@sabidrive/supabase";
import { getCurrentPosition, GeoError, type GeoPosition } from "@/lib/geolocation";

type LocationStatus = "idle" | "requesting" | "granted" | "denied";

export default function SignupPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [schoolName, setSchoolName] = useState("");
  const [address, setAddress] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [position, setPosition] = useState<GeoPosition | null>(null);

  async function requestLocation() {
    setLocationStatus("requesting");
    setLocationError(null);
    try {
      const pos = await getCurrentPosition();
      setPosition(pos);
      setLocationStatus("granted");
    } catch (err) {
      setLocationStatus("denied");
      setLocationError(err instanceof GeoError ? err.message : "Couldn't get your location.");
    }
  }

  // Attempt automatically on load; browsers that block silent prompts just
  // leave this at "idle"/"denied" and the button below covers it.
  useEffect(() => {
    void requestLocation();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!position) {
      setError("Location access is required to create a school.");
      return;
    }
    setIsSubmitting(true);
    try {
      await schoolQueries.signUpSchool(supabase, {
        school_name: schoolName,
        address,
        geofence_lat: position.lat,
        geofence_lng: position.lng,
        full_name: fullName,
        email,
        password
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign up");
      setIsSubmitting(false);
    }
  }

  const canSubmit = locationStatus === "granted" && address.trim().length > 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">Create your school</h1>
      <p className="mb-6 text-neutral-600">Set up SabiDrive for your school — you&apos;ll be the first admin.</p>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">School name</span>
            <input
              required
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">School address</span>
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Example Street, Lagos, Nigeria"
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
            />
          </label>

          <div className="rounded-xl border border-neutral-200 p-3">
            <p className="mb-2 text-sm font-medium text-neutral-700">Device location</p>
            {locationStatus === "granted" ? (
              <Banner tone="info" title="Location captured ✓" />
            ) : locationStatus === "requesting" ? (
              <p className="text-sm text-neutral-500">Waiting for location permission…</p>
            ) : (
              <Banner tone="caution" title="Location access is required">
                {locationError ?? "We use your device's location to place your school on the fleet map."}
              </Banner>
            )}
            {locationStatus !== "granted" ? (
              <Button type="button" variant="secondary" className="mt-2" onClick={requestLocation}>
                Share my location
              </Button>
            ) : null}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Your name</span>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
              autoComplete="name"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Confirm password</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="text-sm text-critical-600">{error}</p> : null}
          <Button type="submit" size="lg" disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? "Creating..." : "Create school & sign in"}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-neutral-500">
        Already have an account? <Link href="/login" className="text-brand-700">Sign in</Link>
      </p>
    </main>
  );
}
