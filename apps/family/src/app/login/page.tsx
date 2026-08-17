"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@tripme/ui";
import { useSession, useSupabaseClient, userQueries } from "@tripme/supabase";

export default function LoginPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { session, profile, isLoading } = useSession();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && session && profile) {
      router.replace(profile.role === "driver" ? "/driver" : "/parent");
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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">Tripme</h1>
      <p className="mb-6 text-neutral-600">Sign in to track your child&apos;s bus.</p>
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
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 text-base focus:border-brand-500 focus:outline-none"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="text-sm text-critical-600">{error}</p> : null}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-neutral-500">
        Demo: driver@tripme.dev / parent1@tripme.dev — password TripmeDemo123!
      </p>
    </main>
  );
}
