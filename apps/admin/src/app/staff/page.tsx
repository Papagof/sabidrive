"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Banner, Button, Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import { adminQueries, userQueries, useSupabaseClient } from "@sabidrive/supabase";
import { InviteUserForm } from "@/components/InviteUserForm";

interface StaffRow {
  id: string;
  full_name: string;
  email: string | null;
  role: "admin" | "driver" | "parent";
  verification_status: string | null;
  deactivated_at: string | null;
}

export default function StaffPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [people, setPeople] = useState<StaffRow[]>([]);
  const [invitingRole, setInvitingRole] = useState<"driver" | "parent" | "admin" | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function refetch() {
    if (!profile?.school_id) return;
    const data = await adminQueries.getSchoolStaffAndGuardians(supabase, profile.school_id);
    setPeople(data as unknown as StaffRow[]);
  }

  async function handleToggleDriverActive(driver: StaffRow) {
    setPendingId(driver.id);
    setActionError(null);
    try {
      await userQueries.setDriverActive(supabase, driver.id, Boolean(driver.deactivated_at));
      setConfirmingId(null);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update driver");
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemoveGuardian(guardianId: string) {
    setPendingId(guardianId);
    setActionError(null);
    try {
      await adminQueries.removeGuardianFromSchool(supabase, guardianId);
      setConfirmingId(null);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove guardian");
    } finally {
      setPendingId(null);
    }
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  if (isLoading) return null;

  const admins = people.filter((p) => p.role === "admin");
  const drivers = people.filter((p) => p.role === "driver");
  const guardians = people.filter((p) => p.role === "parent");

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-800">Staff &amp; guardians</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setInvitingRole(invitingRole === "admin" ? null : "admin")}>
            Invite co-admin
          </Button>
          <Button variant="secondary" onClick={() => setInvitingRole(invitingRole === "driver" ? null : "driver")}>
            Invite driver
          </Button>
          <Button variant="secondary" onClick={() => setInvitingRole(invitingRole === "parent" ? null : "parent")}>
            Invite guardian
          </Button>
        </div>
      </div>

      {invitingRole ? (
        <Card className="mb-4 max-w-md">
          <InviteUserForm
            role={invitingRole}
            onCancel={() => setInvitingRole(null)}
            onInvited={async () => {
              setInvitingRole(null);
              await refetch();
            }}
          />
        </Card>
      ) : null}

      {actionError ? (
        <Banner tone="caution" title="Couldn't complete that" className="mb-4">
          {actionError}
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <h2 className="mb-2 text-lg font-medium">Admins</h2>
          <div className="flex flex-col gap-2">
            {admins.map((a) => (
              <Card key={a.id}>
                <p className="font-medium">
                  {a.full_name}
                  {a.id === profile?.id ? <span className="text-neutral-400"> (you)</span> : null}
                </p>
                <p className="text-sm text-neutral-500">{a.email}</p>
              </Card>
            ))}
            {admins.length === 0 ? <p className="text-neutral-500">No admins yet.</p> : null}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-medium">Drivers</h2>
          <div className="flex flex-col gap-2">
            {drivers.map((d) => (
              <Card key={d.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{d.full_name}</p>
                    <p className="text-sm text-neutral-500">{d.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill
                      label={d.verification_status ?? "pending"}
                      tone={statusToneMap[d.verification_status ?? "pending"] ?? "neutral"}
                    />
                    {d.deactivated_at ? <StatusPill label="Deactivated" tone="caution" /> : null}
                  </div>
                </div>
                {confirmingId === d.id ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      disabled={pendingId === d.id}
                      onClick={() => void handleToggleDriverActive(d)}
                    >
                      {pendingId === d.id ? "Working..." : "Confirm deactivate"}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className="self-start"
                    onClick={() =>
                      d.deactivated_at ? void handleToggleDriverActive(d) : setConfirmingId(d.id)
                    }
                    disabled={pendingId === d.id}
                  >
                    {d.deactivated_at ? "Reactivate" : "Deactivate"}
                  </Button>
                )}
              </Card>
            ))}
            {drivers.length === 0 ? <p className="text-neutral-500">No drivers yet.</p> : null}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-medium">Guardians</h2>
          <div className="flex flex-col gap-2">
            {guardians.map((g) => (
              <Card key={g.id} className="flex flex-col gap-2">
                <div>
                  <p className="font-medium">{g.full_name}</p>
                  <p className="text-sm text-neutral-500">{g.email}</p>
                </div>
                {confirmingId === g.id ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      disabled={pendingId === g.id}
                      onClick={() => void handleRemoveGuardian(g.id)}
                    >
                      {pendingId === g.id ? "Removing..." : "Confirm remove"}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" className="self-start" onClick={() => setConfirmingId(g.id)}>
                    Remove from this school
                  </Button>
                )}
              </Card>
            ))}
            {guardians.length === 0 ? <p className="text-neutral-500">No guardians yet.</p> : null}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
