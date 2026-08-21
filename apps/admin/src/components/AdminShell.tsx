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
  { href: "/announcements", label: "Announcements" },
  { href: "/sms-log", label: "SMS log" },
  { href: "/settings", label: "Settings" }
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { profile } = useSession();
  const [schoolName, setSchoolName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.school_id) return;
    adminQueries.getSchool(supabase, profile.school_id).then((school) => {
      setSchoolName((school as unknown as { name: string }).name);
    });
  }, [supabase, profile?.school_id]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="text-lg font-bold text-neutral-800">{schoolName ?? "Admin"}</span>
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => (
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
