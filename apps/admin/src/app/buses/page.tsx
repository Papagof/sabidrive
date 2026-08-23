"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import { adminQueries, useSupabaseClient } from "@sabidrive/supabase";
import { InviteUserForm } from "@/components/InviteUserForm";

const INVITE_NEW_DRIVER = "__invite_new_driver__";

type VerificationStatus = "pending" | "verified" | "rejected";

interface BusRow {
  id: string;
  label: string;
  status: string;
  retired_at: string | null;
  driver: { id: string; full_name: string; verification_status: VerificationStatus | null } | null;
  attendant: { id: string; full_name: string } | null;
  routes: { id: string; name: string } | null;
}

const UNASSIGNED = "__unassigned__";

const nextVerificationStatus: Record<VerificationStatus, VerificationStatus> = {
  pending: "verified",
  verified: "rejected",
  rejected: "pending"
};

interface OptionRow {
  id: string;
  name: string;
}

export default function BusesPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; full_name: string }[]>([]);
  const [routes, setRoutes] = useState<OptionRow[]>([]);

  const [label, setLabel] = useState("");
  const [driverId, setDriverId] = useState("");
  const [attendantId, setAttendantId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isInvitingDriver, setIsInvitingDriver] = useState(false);

  const [editingBusId, setEditingBusId] = useState<string | null>(null);
  const [editDriverId, setEditDriverId] = useState("");
  const [editAttendantId, setEditAttendantId] = useState("");
  const [editRouteId, setEditRouteId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBlockedByHistory, setDeleteBlockedByHistory] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetiring, setIsRetiring] = useState<string | null>(null);

  async function refetch() {
    if (!profile?.school_id) return;
    const busData = await adminQueries.getSchoolBuses(supabase, profile.school_id);
    setBuses(busData as unknown as BusRow[]);
    const { data: driverRows } = await supabase.from("profiles").select("id, full_name").eq("school_id", profile.school_id).eq("role", "driver");
    setDrivers(driverRows ?? []);
    const { data: routeRows } = await supabase.from("routes").select("id, name").eq("school_id", profile.school_id);
    setRoutes(routeRows ?? []);
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  if (isLoading) return null;

  async function handleCycleVerification(driverId: string, current: VerificationStatus | null) {
    await adminQueries.setDriverVerification(supabase, driverId, nextVerificationStatus[current ?? "pending"]);
    await refetch();
  }

  function startEdit(bus: BusRow) {
    setEditingBusId(bus.id);
    setEditDriverId(bus.driver?.id ?? UNASSIGNED);
    setEditAttendantId(bus.attendant?.id ?? UNASSIGNED);
    setEditRouteId(bus.routes?.id ?? UNASSIGNED);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingBusId(null);
    setEditError(null);
  }

  async function handleSaveEdit(busId: string) {
    setIsSavingEdit(true);
    setEditError(null);
    try {
      await adminQueries.updateBus(supabase, busId, {
        driver_id: editDriverId === UNASSIGNED ? null : editDriverId,
        attendant_id: editAttendantId === UNASSIGNED ? null : editAttendantId,
        default_route_id: editRouteId === UNASSIGNED ? null : editRouteId
      });
      setEditingBusId(null);
      await refetch();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update bus");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDelete(busId: string) {
    setIsDeleting(true);
    setDeleteError(null);
    setDeleteBlockedByHistory(false);
    try {
      await adminQueries.deleteBus(supabase, busId);
      setConfirmingDeleteId(null);
      await refetch();
    } catch (err) {
      setDeleteBlockedByHistory(err instanceof adminQueries.BusHasTripHistoryError);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete bus");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleToggleRetire(bus: BusRow) {
    setIsRetiring(bus.id);
    try {
      await adminQueries.setBusRetired(supabase, bus.id, !bus.retired_at);
      setConfirmingDeleteId(null);
      setDeleteError(null);
      setDeleteBlockedByHistory(false);
      await refetch();
    } finally {
      setIsRetiring(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminQueries.createBus(supabase, {
        school_id: profile.school_id,
        label,
        driver_id: driverId || null,
        attendant_id: attendantId || null,
        default_route_id: routeId || null
      });
      setLabel("");
      setDriverId("");
      setAttendantId("");
      setRouteId("");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bus");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold text-brand-800">Buses</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card>
          <h2 className="mb-2 font-medium">New bus</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bus label (e.g. Bus 12)"
              required
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            />
            <select
              value={isInvitingDriver ? INVITE_NEW_DRIVER : driverId}
              onChange={(e) => {
                if (e.target.value === INVITE_NEW_DRIVER) {
                  setIsInvitingDriver(true);
                } else {
                  setIsInvitingDriver(false);
                  setDriverId(e.target.value);
                }
              }}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Assign driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
              <option value={INVITE_NEW_DRIVER}>+ Invite new driver…</option>
            </select>
            {isInvitingDriver ? (
              <InviteUserForm
                role="driver"
                onCancel={() => setIsInvitingDriver(false)}
                onInvited={async (user) => {
                  setIsInvitingDriver(false);
                  await refetch();
                  setDriverId(user.userId);
                }}
              />
            ) : null}
            <select
              value={attendantId}
              onChange={(e) => setAttendantId(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Assign backup driver (attendant)…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
            >
              <option value="">Assign route…</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {error ? <p className="text-sm text-critical-600">{error}</p> : null}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Create bus"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-2">
          {buses.map((bus) =>
            editingBusId === bus.id ? (
              <Card key={bus.id} className="flex flex-col gap-2">
                <p className="font-medium">{bus.label}</p>
                <select
                  value={editDriverId}
                  onChange={(e) => setEditDriverId(e.target.value)}
                  className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                >
                  <option value={UNASSIGNED}>No driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
                <select
                  value={editAttendantId}
                  onChange={(e) => setEditAttendantId(e.target.value)}
                  className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                >
                  <option value={UNASSIGNED}>No backup driver (attendant)</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
                <select
                  value={editRouteId}
                  onChange={(e) => setEditRouteId(e.target.value)}
                  className="min-h-control rounded-lg border border-neutral-300 px-3 focus:border-brand-500 focus:outline-none"
                >
                  <option value={UNASSIGNED}>No route</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {editError ? <p className="text-sm text-critical-600">{editError}</p> : null}
                <div className="flex gap-2">
                  <Button onClick={() => handleSaveEdit(bus.id)} disabled={isSavingEdit} className="flex-1">
                    {isSavingEdit ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="ghost" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </Card>
            ) : (
              <Card key={bus.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{bus.label}</p>
                    <p className="text-sm text-neutral-500">
                      {bus.driver?.full_name ?? "No driver"}
                      {bus.attendant ? ` (backup: ${bus.attendant.full_name})` : ""} · {bus.routes?.name ?? "No route"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {bus.driver ? (
                      <button onClick={() => handleCycleVerification(bus.driver!.id, bus.driver!.verification_status)}>
                        <StatusPill
                          label={`driver: ${bus.driver.verification_status ?? "pending"}`}
                          tone={statusToneMap[bus.driver.verification_status ?? "pending"] ?? "neutral"}
                        />
                      </button>
                    ) : null}
                    <StatusPill label={bus.status} tone={statusToneMap[bus.status] ?? "neutral"} />
                    {bus.retired_at ? <StatusPill label="Retired" tone="caution" /> : null}
                    {!bus.retired_at ? (
                      <Button variant="secondary" onClick={() => startEdit(bus)}>
                        Edit
                      </Button>
                    ) : null}
                  </div>
                </div>

                {bus.retired_at ? (
                  <Button
                    variant="ghost"
                    className="self-start"
                    disabled={isRetiring === bus.id}
                    onClick={() => handleToggleRetire(bus)}
                  >
                    {isRetiring === bus.id ? "Restoring..." : "Restore"}
                  </Button>
                ) : confirmingDeleteId === bus.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      {deleteError ? <p className="flex-1 text-sm text-critical-600">{deleteError}</p> : <span className="flex-1 text-sm text-neutral-500">Delete this bus?</span>}
                      <Button variant="secondary" disabled={isDeleting} onClick={() => handleDelete(bus.id)}>
                        {isDeleting ? "Deleting..." : "Confirm delete"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setConfirmingDeleteId(null);
                          setDeleteError(null);
                          setDeleteBlockedByHistory(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    {deleteBlockedByHistory ? (
                      <Button
                        variant="secondary"
                        className="self-start"
                        disabled={isRetiring === bus.id}
                        onClick={() => handleToggleRetire(bus)}
                      >
                        {isRetiring === bus.id ? "Retiring..." : "Retire instead"}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setConfirmingDeleteId(bus.id)}>
                      Delete
                    </Button>
                    <Button variant="ghost" disabled={isRetiring === bus.id} onClick={() => handleToggleRetire(bus)}>
                      {isRetiring === bus.id ? "Retiring..." : "Retire"}
                    </Button>
                  </div>
                )}
              </Card>
            )
          )}
          {buses.length === 0 ? <p className="text-neutral-500">No buses yet.</p> : null}
        </div>
      </div>
    </AdminShell>
  );
}
