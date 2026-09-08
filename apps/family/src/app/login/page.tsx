"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatedBusesBackdrop, Banner, Button, Card, PasswordInput } from "@sabidrive/ui";
import { useSession, useSupabaseClient, userQueries } from "@sabidrive/supabase";

// Admin is a genuinely separate app/origin (separate Vercel deployment,
// separate localStorage) -- signing in here can't make admin.sabidrive.com
// see a session for free. An admin-role sign-in instead gets bridged there
// via a URL fragment carrying the just-issued session tokens (see
// apps/admin/src/app/auth-bridge/page.tsx), the same "establish a session
// from a magic-link-style URL" technique this app already uses for invite
// and password-reset links. Hardcoded to the .vercel.app URL, not
// admin.sabidrive.com, matching the same tradeoff already accepted
// elsewhere in this codebase (admin's own FAMILY_APP_URL constant) --
// correct regardless of whether the custom domain's DNS is attached yet.
const ADMIN_APP_URL = "https://sabidrive-admin.vercel.app";

export default function LoginPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { session, profile, isLoading } = useSession();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [view, setView] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!isLoading && session && profile) {
      if (profile.role === "admin") {
        window.location.href = `${ADMIN_APP_URL}/auth-bridge#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
      } else {
        router.replace(profile.role === "driver" ? "/driver" : "/parent");
      }
    }
  }, [isLoading, session, profile, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    if (method === "email") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setIsSubmitting(false);
      if (signInError) setError(signInError.message);
    } else {
      try {
        const { access_token, refresh_token } = await userQueries.loginWithPhone(phone, password);
        await supabase.auth.setSession({ access_token, refresh_token });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sign in");
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`
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
      <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <AnimatedBusesBackdrop />
        <h1 className="mb-6 rounded-xl bg-white/70 px-3 py-2 text-neutral-600 backdrop-blur-sm">Reset your password.</h1>
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
    <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <AnimatedBusesBackdrop />
      <h1 className="mb-6 rounded-xl bg-white/70 px-3 py-2 text-neutral-600 backdrop-blur-sm">
        Sign in to track your child&apos;s bus.
      </h1>
      <Card>
        <div className="mb-4 flex gap-1 rounded-lg bg-neutral-100 p-1">
          <button
            type="button"
            onClick={() => setMethod("email")}
            className={`min-h-control flex-1 rounded-md text-sm font-medium ${
              method === "email" ? "bg-white text-brand-700 shadow-sm" : "text-neutral-500"
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setMethod("phone")}
            className={`min-h-control flex-1 rounded-md text-sm font-medium ${
              method === "phone" ? "bg-white text-brand-700 shadow-sm" : "text-neutral-500"
            }`}
          >
            Phone
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {method === "email" ? (
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
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">Phone number</span>
              <input
                type="tel"
                required
                placeholder="+15551234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
                autoComplete="tel"
              />
            </label>
          )}
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
        {method === "email" ? (
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
        ) : null}
      </Card>
      <p className="mt-4 text-center text-sm text-neutral-500">
        New school?{" "}
        <a href={`${ADMIN_APP_URL}/signup`} className="text-brand-700">
          Create an account
        </a>
      </p>
    </main>
  );
}
