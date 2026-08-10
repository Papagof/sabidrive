"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, StatusPill, statusToneMap } from "@tripme/ui";
import { tripQueries, useSupabaseClient } from "@tripme/supabase";
import { useRequireRole } from "@/lib/useRequireRole";

interface AttendanceRow {
  id: string;
  student_id: string;
  status: string;
  students: { first_name: string; last_name: string } | null;
}

export default function DriverTripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { isLoading: isAuthLoading } = useRequireRole(["driver"]);
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    const data = await tripQueries.getAttendanceForTrip(supabase, tripId);
    setAttendance(data as unknown as AttendanceRow[]);
  }

  useEffect(() => {
    void refetch();
    const channel = supabase
      .channel(`driver-trip-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_expectations", filter: `trip_id=eq.${tripId}` },
        () => void refetch()
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tripId]);

  async function handleEndTrip() {
    setIsEnding(true);
    setError(null);
    try {
      await tripQueries.endTrip(supabase, tripId);
      router.push("/driver");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end trip");
    } finally {
      setIsEnding(false);
    }
  }

  if (isAuthLoading) return null;

  const boardedCount = attendance.filter((a) => a.status === "boarded").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold text-brand-800">Trip in progress</h1>
      <p className="text-neutral-600">
        {boardedCount} of {attendance.length} students boarded
      </p>
      <Button size="lg" onClick={() => router.push(`/driver/trip/${tripId}/scan`)}>
        Scan student
      </Button>
      <Card className="flex flex-col gap-2">
        {attendance.map((row) => (
          <div key={row.id} className="flex items-center justify-between border-b border-neutral-100 py-2 last:border-0">
            <span>
              {row.students?.first_name} {row.students?.last_name}
            </span>
            <StatusPill label={row.status} tone={statusToneMap[row.status] ?? "neutral"} />
          </div>
        ))}
      </Card>
      {error ? <p className="text-sm text-critical-600">{error}</p> : null}
      <Button variant="secondary" size="lg" onClick={handleEndTrip} disabled={isEnding}>
        {isEnding ? "Ending trip..." : "End Trip"}
      </Button>
    </main>
  );
}
