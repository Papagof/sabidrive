"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner, Card } from "@sabidrive/ui";
import { useSupabaseClient } from "@sabidrive/supabase";

// Landing page for the cross-origin sign-in handoff from the family app's
// /login (an admin-role sign-in there can't leave a session here for free --
// separate app, separate origin, separate localStorage). The tokens travel
// as a URL fragment, which never reaches any server, and are scrubbed from
// the visible URL/history the moment they're read -- same technique and
// risk level this app already accepts for invite/password-reset links.
export default function AuthBridgePage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    window.history.replaceState(null, "", window.location.pathname);

    if (!access_token || !refresh_token) {
      setError("Missing sign-in details. Please sign in again.");
      return;
    }

    supabase.auth.setSession({ access_token, refresh_token }).then(({ error: setSessionError }) => {
      if (setSessionError) {
        setError(setSessionError.message);
        return;
      }
      router.replace("/");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <Card>
          <Banner tone="caution" title="Couldn't sign you in">
            {error}
          </Banner>
          <Link href="/login" className="mt-4 inline-block text-sm text-brand-700">
            Back to sign in
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-neutral-500">Signing you in…</p>
    </main>
  );
}
