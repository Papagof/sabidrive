"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";

interface RouteRow {
  id: string;
  name: string;
  direction: string;
  stops: { id: string }[];
}

export default function RoutesPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [routes, setRoutes] = useState<RouteRow[]>([]);

  useEffect(() => {
    if (!profile?.school_id) return;
    adminQueries.getSchoolRoutes(supabase, profile.school_id).then((data) => setRoutes(data as unknown as RouteRow[]));
  }, [supabase, profile?.school_id]);

  if (isLoading) return null;

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-800">Routes &amp; stops</h1>
        <Link href="/routes/new">
          <Button>New route</Button>
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {routes.map((route) => (
          <Link key={route.id} href={`/routes/${route.id}`}>
            <Card className="flex items-center justify-between transition hover:border-brand-300">
              <div>
                <p className="font-medium">{route.name}</p>
                <p className="text-sm text-neutral-500">{route.stops?.length ?? 0} stop(s)</p>
              </div>
              <StatusPill label={route.direction} tone="neutral" />
            </Card>
          </Link>
        ))}
        {routes.length === 0 ? <p className="text-neutral-500">No routes yet.</p> : null}
      </div>
    </AdminShell>
  );
}
