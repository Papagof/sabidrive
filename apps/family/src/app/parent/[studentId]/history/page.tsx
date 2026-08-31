"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Banner, Card, StatusPill, statusToneMap } from "@sabidrive/ui";
import { studentQueries, buildTripHistory, useSupabaseClient, type OnTimeStatus, type TripHistoryEntry } from "@sabidrive/supabase";
import { useRequireGuardianAccess } from "@/lib/useRequireRole";

const DAYS_BACK = 30;

function sinceISODate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const directionLabel: Record<string, string> = {
  pickup: "Morning pickup",
  dropoff: "Afternoon drop-off"
};

const onTimeLabel: Record<OnTimeStatus, string> = {
  on_time: "On time",
  late: "Late",
  early: "Early"
};

export default function TripHistoryPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { isLoading: isAuthLoading } = useRequireGuardianAccess();
  const supabase = useSupabaseClient();

  const [studentName, setStudentName] = useState<string | null>(null);
  const [entries, setEntries] = useState<TripHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("students")
      .select("first_name, last_name")
      .eq("id", studentId)
      .single()
      .then(({ data }) => setStudentName(data ? `${data.first_name} ${data.last_name}` : null));
  }, [supabase, studentId]);

  useEffect(() => {
    studentQueries
      .getTripHistoryForStudent(supabase, studentId, sinceISODate(DAYS_BACK))
      .then(({ attendance, checkIns, timeZone }) => {
        setEntries(buildTripHistory(attendance, checkIns, timeZone));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trip history"));
  }, [supabase, studentId]);

  if (isAuthLoading) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <Link href={`/parent/${studentId}`} className="self-start text-sm text-brand-700">
        ← Back
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-brand-800">Trip History{studentName ? ` — ${studentName}` : ""}</h1>
        <p className="text-sm text-neutral-500">Last {DAYS_BACK} days</p>
      </div>

      {error ? (
        <Banner tone="caution" title="Couldn't load trip history">
          {error}
        </Banner>
      ) : null}

      {entries === null && !error ? <p className="text-neutral-500">Loading…</p> : null}

      {entries !== null ? (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <Card key={e.tripId} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {new Date(e.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                  <p className="text-sm text-neutral-500">{directionLabel[e.direction] ?? e.direction}</p>
                </div>
                <StatusPill label={e.attendanceStatus} tone={statusToneMap[e.attendanceStatus] ?? "neutral"} />
              </div>
              {e.checkedInAt ? (
                <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-sm">
                  <span className="text-neutral-600">
                    {e.stopName ? `${e.stopName} · ` : ""}
                    {new Date(e.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {e.onTimeStatus ? (
                    <StatusPill label={onTimeLabel[e.onTimeStatus]} tone={statusToneMap[e.onTimeStatus] ?? "neutral"} />
                  ) : null}
                </div>
              ) : null}
            </Card>
          ))}
          {entries.length === 0 ? <p className="text-neutral-500">No trips in the last {DAYS_BACK} days.</p> : null}
        </div>
      ) : null}
    </main>
  );
}
