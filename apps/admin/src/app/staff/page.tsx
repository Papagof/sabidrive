"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill, statusToneMap } from "@tripme/ui";
import { adminQueries, useSupabaseClient } from "@tripme/supabase";
import { InviteUserForm } from "@/components/InviteUserForm";

interface StaffRow {
  id: string;
  full_name: string;
  email: string | null;
  role: "driver" | "parent";
  verification_status: string | null;
}

export default function StaffPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [people, setPeople] = useState<StaffRow[]>([]);
  const [invitingRole, setInvitingRole] = useState<"driver" | "parent" | null>(null);

  async function refetch() {
    if (!profile?.school_id) return;
    const data = await adminQueries.getSchoolStaffAndGuardians(supabase, profile.school_id);
    setPeople(data as unknown as StaffRow[]);
  }

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.school_id]);

  if (isLoading) return null;

  const drivers = people.filter((p) => p.role === "driver");
  const guardians = people.filter((p) => p.role === "parent");

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-800">Staff &amp; guardians</h1>
        <div className="flex gap-2">
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-medium">Drivers</h2>
          <div className="flex flex-col gap-2">
            {drivers.map((d) => (
              <Card key={d.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{d.full_name}</p>
                  <p className="text-sm text-neutral-500">{d.email}</p>
                </div>
                <StatusPill
                  label={d.verification_status ?? "pending"}
                  tone={statusToneMap[d.verification_status ?? "pending"] ?? "neutral"}
                />
              </Card>
            ))}
            {drivers.length === 0 ? <p className="text-neutral-500">No drivers yet.</p> : null}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-medium">Guardians</h2>
          <div className="flex flex-col gap-2">
            {guardians.map((g) => (
              <Card key={g.id}>
                <p className="font-medium">{g.full_name}</p>
                <p className="text-sm text-neutral-500">{g.email}</p>
              </Card>
            ))}
            {guardians.length === 0 ? <p className="text-neutral-500">No guardians yet.</p> : null}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
