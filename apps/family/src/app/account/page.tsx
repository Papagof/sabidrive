"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Banner, Button, Card, StatusPill } from "@sabidrive/ui";
import { useSupabaseClient, userQueries } from "@sabidrive/supabase";
import { useRequireGuardianAccess } from "@/lib/useRequireRole";

type Step = "idle" | "entering_phone" | "code_sent";

type NotificationType = "boarding" | "alighting" | "delay" | "geofence" | "mismatch" | "announcement" | "message";

const NOTIFICATION_TYPES: { type: NotificationType; label: string }[] = [
  { type: "boarding", label: "Boarding" },
  { type: "alighting", label: "Drop-off" },
  { type: "mismatch", label: "Missed pickup" },
  { type: "delay", label: "Delays" },
  { type: "geofence", label: "Geofence alerts" },
  { type: "announcement", label: "School announcements" },
  { type: "message", label: "Trip messages" }
];

export default function AccountPage() {
  const { profile, isLoading } = useRequireGuardianAccess();
  const supabase = useSupabaseClient();
  const [emailConfirmed, setEmailConfirmed] = useState(false);

  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmailConfirmed(Boolean(data.user?.email_confirmed_at));
    });
  }, [supabase]);

  useEffect(() => {
    if (!profile) return;
    setPhoneVerified(profile.phone_verified);
    setVerifiedPhone(profile.phone_verified ? profile.phone : null);
    setNotificationPrefs(profile.notification_prefs ?? {});
  }, [profile]);

  async function handleToggleNotification(type: NotificationType) {
    if (!profile) return;
    const nextEnabled = !(notificationPrefs[type] ?? true);
    const previous = notificationPrefs;
    const next = { ...notificationPrefs, [type]: nextEnabled };
    setNotificationPrefs(next);
    setNotificationError(null);
    try {
      await userQueries.updateNotificationPrefs(supabase, profile.id, next);
    } catch (err) {
      setNotificationPrefs(previous);
      setNotificationError(err instanceof Error ? err.message : "Failed to save notification preference");
    }
  }

  if (isLoading) return null;

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setIsSending(true);
    try {
      await userQueries.sendPhoneOtp(supabase, phone.trim());
      setStep("code_sent");
      setPhoneVerified(false);
      setStatus("Code sent — check your phone.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsVerifying(true);
    try {
      await userQueries.verifyPhoneOtp(supabase, code.trim());
      setPhoneVerified(true);
      setVerifiedPhone(phone.trim());
      setStatus("Phone number verified.");
      setStep("idle");
      setCode("");
      setPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify code");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-800">Account</h1>
        <Link href={profile?.role === "driver" ? "/driver" : "/parent"} className="text-sm text-brand-700">
          Back
        </Link>
      </div>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-medium">Email</p>
          <p className="text-sm text-neutral-500">{profile?.email}</p>
        </div>
        <StatusPill label={emailConfirmed ? "Verified" : "Unverified"} tone={emailConfirmed ? "positive" : "caution"} />
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-medium">Phone</p>
          <StatusPill label={phoneVerified ? "Verified" : "Unverified"} tone={phoneVerified ? "positive" : "caution"} />
        </div>

        {phoneVerified && step === "idle" ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">{verifiedPhone}</p>
            <Button variant="ghost" onClick={() => setStep("entering_phone")}>
              Change
            </Button>
          </div>
        ) : null}

        {step === "entering_phone" || (!phoneVerified && step === "idle") ? (
          <form onSubmit={handleSendCode} className="flex flex-col gap-2">
            <input
              type="tel"
              required
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
              autoComplete="tel"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isSending}>
                {isSending ? "Sending..." : "Send verification code"}
              </Button>
              {step === "entering_phone" ? (
                <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {step === "code_sent" ? (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-2">
            <p className="text-sm text-neutral-500">Enter the 6-digit code we texted you.</p>
            <input
              inputMode="numeric"
              required
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isVerifying}>
                {isVerifying ? "Verifying..." : "Verify"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {status ? <p className="mt-2 text-sm text-calm-700">{status}</p> : null}
        {error ? (
          <Banner tone="caution" title="Couldn't complete that">
            {error}
          </Banner>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <p className="font-medium">Notifications</p>
          <p className="text-sm text-neutral-500">Choose which alerts you get pushed or texted. SOS alerts always come through.</p>
        </div>
        <div className="flex flex-col gap-2">
          {NOTIFICATION_TYPES.map(({ type, label }) => {
            const enabled = notificationPrefs[type] ?? true;
            return (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm text-neutral-700">{label}</span>
                <Button
                  type="button"
                  size="md"
                  variant={enabled ? "primary" : "secondary"}
                  onClick={() => handleToggleNotification(type)}
                >
                  {enabled ? "On" : "Off"}
                </Button>
              </div>
            );
          })}
        </div>
        {notificationError ? (
          <Banner tone="caution" title="Couldn't save that">
            {notificationError}
          </Banner>
        ) : null}
      </Card>

      <Link href="/privacy" className="text-center text-sm text-neutral-500">
        Privacy Policy
      </Link>
    </main>
  );
}
