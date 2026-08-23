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
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function refetch() {
    if (!profile?.school_id) return;
    const data = await adminQueries.getSchoolRoutes(supabase, profile.school_id);
    setRoutes(data as unknown as RouteRow[]);
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  if (isLoading) return null;

  async function handleDelete(routeId: string) {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await adminQueries.deleteRoute(supabase, routeId);
      setConfirmingDeleteId(null);
      await refetch();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete route");
    } finally {
      setIsDeleting(false);
    }
  }

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
          <Card key={route.id} className="flex flex-col gap-2">
            <Link href={`/routes/${route.id}`} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{route.name}</p>
                <p className="text-sm text-neutral-500">{route.stops?.length ?? 0} stop(s)</p>
              </div>
              <StatusPill label={route.direction} tone="neutral" />
            </Link>
            {confirmingDeleteId === route.id ? (
              <div className="flex items-center gap-2">
                {deleteError ? (
                  <p className="flex-1 text-sm text-critical-600">{deleteError}</p>
                ) : (
                  <span className="flex-1 text-sm text-neutral-500">Delete this route?</span>
                )}
                <Button variant="secondary" disabled={isDeleting} onClick={() => handleDelete(route.id)}>
                  {isDeleting ? "Deleting..." : "Confirm delete"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirmingDeleteId(null);
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="self-start"
                onClick={() => {
                  setConfirmingDeleteId(route.id);
                  setDeleteError(null);
                }}
              >
                Delete
              </Button>
            )}
          </Card>
        ))}
        {routes.length === 0 ? <p className="text-neutral-500">No routes yet.</p> : null}
      </div>
    </AdminShell>
  );
}
