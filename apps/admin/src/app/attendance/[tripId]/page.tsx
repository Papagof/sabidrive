"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import { tripQueries, useSupabaseClient } from "@sabidrive/supabase";

interface AttendanceRow {
  id: string;
  status: string;
  students: { first_name: string; last_name: string } | null;
}

export default function AttendancePage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  async function refetch() {
    const data = await tripQueries.getAttendanceForTrip(supabase, tripId);
    setAttendance(data as unknown as AttendanceRow[]);
  }

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(`admin-attendance-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_expectations", filter: `trip_id=eq.${tripId}` },
        () => void refetch()
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tripId]);

  if (isLoading) return null;

  const boarded = attendance.filter((a) => a.status === "boarded").length;
  const missed = attendance.filter((a) => a.status === "missed").length;
  const pending = attendance.filter((a) => a.status === "pending").length;

  return (
    <AdminShell>
      <h1 className="mb-1 text-2xl font-semibold text-brand-800">Attendance reconciliation</h1>
      <p className="mb-4 text-neutral-600">
        {boarded} boarded · {pending} pending · {missed} missed
      </p>
      <Card className="flex flex-col gap-2">
        {attendance.map((row) => (
          <div key={row.id} className="flex items-center justify-between border-b border-neutral-100 py-2 last:border-0">
            <span>
              {row.students?.first_name} {row.students?.last_name}
            </span>
            <StatusPill label={row.status} tone={statusToneMap[row.status] ?? "neutral"} />
          </div>
        ))}
        {attendance.length === 0 ? <p className="text-neutral-500">No expected students for this trip.</p> : null}
      </Card>
    </AdminShell>
  );
}
