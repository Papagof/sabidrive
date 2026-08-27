"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PasswordInput } from "@sabidrive/ui";
import { useSession, useSupabaseClient } from "@sabidrive/supabase";

const SESSION_TIMEOUT_MS = 6000;

// This page is the landing spot for two different email links -- an admin's
// invite (apps/admin/src/app/api/invite-user) and a "forgot password" reset
// (both apps' login pages) -- supabase-js's detectSessionInUrl handles both
// the same way, so one page covers both rather than duplicating it.
const ADMIN_APP_URL = "https://admin.sabidrive.com";

export default function SetPasswordPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { session, profile, isLoading } = useSession();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // supabase-js auto-detects the invite/reset link's session from the URL on
  // load (detectSessionInUrl, on by default) -- if it never shows up, the
  // link was invalid, expired, or already used.
  useEffect(() => {
    if (session) return;
    const timer = setTimeout(() => setTimedOut(true), SESSION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [session]);

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
    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (profile?.role === "admin") {
      window.location.href = `${ADMIN_APP_URL}/dashboard`;
      return;
    }
    router.replace(profile?.role === "driver" ? "/driver" : "/parent");
  }

  if (!isLoading && !session && timedOut) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 text-center">
        <h1 className="mb-2 text-2xl font-semibold text-brand-800">Link invalid</h1>
        <p className="text-neutral-600">
          This link is invalid or has already been used. If you were setting a password from an invite, ask your
          school admin to send a new one. If you were resetting your password, request a new reset link and try
          again.
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Setting up your account…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-neutral-600">Set a password for {session.user.email}.</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Password</span>
            <PasswordInput
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Confirm password</span>
            <PasswordInput
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="text-sm text-critical-600">{error}</p> : null}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Set password & continue"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
