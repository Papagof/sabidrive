"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { adminQueries, useSession, useSupabaseClient } from "@sabidrive/supabase";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Fleet map" },
  { href: "/routes", label: "Routes & stops" },
  { href: "/buses", label: "Buses" },
  { href: "/students", label: "Students" },
  { href: "/staff", label: "Staff & guardians" },
  { href: "/alerts", label: "Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/announcements", label: "Announcements" },
  { href: "/sms-log", label: "SMS log" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" }
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { session, profile } = useSession();
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    if (!profile?.school_id) return;
    adminQueries.getSchool(supabase, profile.school_id).then((school) => {
      const s = school as unknown as { name: string; logo_url: string | null };
      setSchoolName(s.name);
      setLogoUrl(s.logo_url);
    });
  }, [supabase, profile?.school_id]);

  useEffect(() => {
    // Depends on the access token (a stable primitive), not just `supabase`
    // -- the client reference is stable across a login redirect, but the
    // session itself hydrates asynchronously, and checkIsDeveloper reads it
    // via getSession() at call time. Without this, the check can fire once
    // before the session is actually available and never re-run. Using the
    // token itself (not the whole `session` object, which gets a new
    // reference on every onAuthStateChange firing -- INITIAL_SESSION,
    // SIGNED_IN, etc. -- even when the token hasn't changed) avoids
    // re-checking redundantly, same "depend on a primitive, not the whole
    // object" pattern the school-name effect above already uses.
    if (!session?.access_token) return;
    adminQueries.checkIsDeveloper(supabase).then(setIsDeveloper);
  }, [supabase, session?.access_token]);

  const navItems = isDeveloper ? [...NAV_ITEMS, { href: "/developer/schools", label: "Developer" }] : NAV_ITEMS;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="flex items-center gap-2 text-lg font-bold text-neutral-800">
            {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain" /> : null}
            {schoolName ?? "Admin"}
          </span>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname?.startsWith(item.href) ? "bg-brand-50 text-brand-700" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            className="text-sm text-neutral-500 hover:text-neutral-800"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
