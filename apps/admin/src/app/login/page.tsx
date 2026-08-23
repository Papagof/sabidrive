"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banner, Button, Card, PasswordInput } from "@sabidrive/ui";
import { useSession, useSupabaseClient } from "@sabidrive/supabase";

// Admin has no set-password page of its own -- password-reset links land on
// the family app's (same page the invite-by-email flow already uses, and
// already on Supabase's redirect allow-list, so this needs no new manual
// dashboard step). Hardcoded rather than an env var, same tradeoff already
// accepted for the /start page's cross-app link: correct in production,
// just redirects to the deployed family app (not localhost) if you're
// testing this locally.
const FAMILY_APP_URL = "https://family-six-theta.vercel.app";

export default function LoginPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [view, setView] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!isLoading && session) router.replace("/dashboard");
  }, [isLoading, session, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (signInError) setError(signInError.message);
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${FAMILY_APP_URL}/set-password`
    });
    setIsSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setResetSent(true);
  }

  if (view === "forgot") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <h1 className="mb-6 text-neutral-600">Reset your password.</h1>
        <Card>
          {resetSent ? (
            <Banner tone="info" title="Check your email">
              If an account exists for {email}, a password reset link is on its way.
            </Banner>
          ) : (
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
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
              {error ? <p className="text-sm text-critical-600">{error}</p> : null}
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
          <button
            type="button"
            onClick={() => {
              setView("signin");
              setResetSent(false);
              setError(null);
            }}
            className="mt-4 text-sm text-brand-700"
          >
            ← Back to sign in
          </button>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-neutral-600">Sign in to manage routes, buses, and attendance.</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="text-sm text-critical-600">{error}</p> : null}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setView("forgot");
            setError(null);
          }}
          className="mt-4 text-sm text-brand-700"
        >
          Forgot password?
        </button>
      </Card>
      <p className="mt-4 text-center text-sm text-neutral-500">
        New school? <Link href="/signup" className="text-brand-700">Create an account</Link>
      </p>
    </main>
  );
}
