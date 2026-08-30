"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useRequireAdmin } from "@/lib/useRequireRole";
import { Button, Card, StatusPill } from "@sabidrive/ui";
import {
  adminQueries,
  buildReportsCsv,
  summarizeAlerts,
  summarizeAttendance,
  summarizeTrips,
  useSupabaseClient,
  type AlertRow,
  type AttendanceRow,
  type TripRow
} from "@sabidrive/supabase";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 }
] as const;

const severityTone = { info: "info", warning: "caution", critical: "critical" } as const;

function sinceISODate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function BarRow({ label, count, maxCount, tone }: { label: string; count: number; maxCount: number; tone?: string }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-700">{label}</span>
        <span className="font-medium text-neutral-800">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100">
        <div
          className={`h-2 rounded-full ${tone === "critical" ? "bg-critical-500" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { profile, isLoading } = useRequireAdmin();
  const supabase = useSupabaseClient();
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [smsCount, setSmsCount] = useState<number>(0);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (!profile?.school_id) return;
    const since = sinceISODate(rangeDays);
    setIsFetching(true);
    Promise.all([
      adminQueries.getTripsInRange(supabase, profile.school_id, since),
      adminQueries.getAttendanceInRange(supabase, profile.school_id, since),
      adminQueries.getAlertsInRange(supabase, profile.school_id, since),
      adminQueries.getSmsCountInRange(supabase, since)
    ])
      .then(([tripsData, attendanceData, alertsData, smsData]) => {
        setTrips(tripsData);
        setAttendance(attendanceData);
        setAlerts(alertsData);
        setSmsCount(smsData);
      })
      .finally(() => setIsFetching(false));
  }, [supabase, profile?.school_id, rangeDays]);

  const tripsSummary = useMemo(() => summarizeTrips(trips), [trips]);
  const attendanceSummary = useMemo(() => summarizeAttendance(attendance), [attendance]);
  const alertsSummary = useMemo(() => summarizeAlerts(alerts), [alerts]);

  function handleExportCsv() {
    const today = new Date().toISOString().slice(0, 10);
    const csv = buildReportsCsv({
      rangeLabel: `${rangeDays}d`,
      generatedAtISODate: today,
      trips: tripsSummary,
      attendance: attendanceSummary,
      alerts: alertsSummary,
      smsCount
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sabidrive-report-${rangeDays}d-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return null;

  const maxRouteCount = tripsSummary.byRoute[0]?.count ?? 0;
  const maxAlertTypeCount = alertsSummary.byType[0]?.count ?? 0;
  const maxDriverCount = alertsSummary.topDrivers[0]?.count ?? 0;

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-800">Reports</h1>
        <div className="flex gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.days}
              variant={rangeDays === opt.days ? "primary" : "secondary"}
              size="md"
              onClick={() => setRangeDays(opt.days)}
            >
              {opt.label}
            </Button>
          ))}
          <Button variant="secondary" size="md" onClick={handleExportCsv} disabled={isFetching}>
            Export CSV
          </Button>
        </div>
      </div>

      {isFetching ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">Trips</h2>
            <div className="flex gap-4 text-sm text-neutral-600">
              <span>
                <span className="text-xl font-semibold text-neutral-800">{tripsSummary.total}</span> total
              </span>
              <span>
                <span className="text-xl font-semibold text-calm-700">{tripsSummary.completed}</span> completed
              </span>
              <span>
                <span className="text-xl font-semibold text-caution-700">{tripsSummary.cancelled}</span> cancelled
              </span>
            </div>
            {tripsSummary.avgDurationMinutes != null ? (
              <p className="text-sm text-neutral-600">Average trip duration: {Math.round(tripsSummary.avgDurationMinutes)} min</p>
            ) : null}
            {tripsSummary.byRoute.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <p className="text-sm font-medium text-neutral-700">By route</p>
                {tripsSummary.byRoute.map((r) => (
                  <BarRow key={r.routeId} label={r.routeName ?? "Unnamed route"} count={r.count} maxCount={maxRouteCount} />
                ))}
              </div>
            ) : null}
            {tripsSummary.total === 0 ? <p className="text-sm text-neutral-500">No trips in this range.</p> : null}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">Attendance</h2>
            <div className="flex gap-4 text-sm text-neutral-600">
              <span>
                <span className="text-xl font-semibold text-neutral-800">{attendanceSummary.total}</span> expected
              </span>
              <span>
                <span className="text-xl font-semibold text-calm-700">{attendanceSummary.boarded}</span> boarded
              </span>
              <span>
                <span className="text-xl font-semibold text-caution-700">{attendanceSummary.missed}</span> missed
              </span>
              <span>
                <span className="text-xl font-semibold text-neutral-500">{attendanceSummary.excused}</span> excused
              </span>
            </div>
            {attendanceSummary.total > 0 ? (
              <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <BarRow label="Boarded" count={attendanceSummary.boarded} maxCount={attendanceSummary.total} />
                <BarRow label="Missed" count={attendanceSummary.missed} maxCount={attendanceSummary.total} tone="critical" />
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No attendance records in this range.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">Incidents</h2>
            <div className="flex items-center gap-4 text-sm text-neutral-600">
              <span>
                <span className="text-xl font-semibold text-neutral-800">{alertsSummary.total}</span> total
              </span>
              <span>{Math.round(alertsSummary.resolvedPct)}% resolved</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alertsSummary.bySeverity.map((s) => (
                <StatusPill
                  key={s.severity}
                  label={`${s.severity}: ${s.count}`}
                  tone={severityTone[s.severity as keyof typeof severityTone] ?? "neutral"}
                />
              ))}
            </div>
            {alertsSummary.byType.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <p className="text-sm font-medium text-neutral-700">By type</p>
                {alertsSummary.byType.map((t) => (
                  <BarRow key={t.type} label={t.type.replace(/_/g, " ")} count={t.count} maxCount={maxAlertTypeCount} />
                ))}
              </div>
            ) : null}
            {alertsSummary.topDrivers.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <p className="text-sm font-medium text-neutral-700">Top drivers by incident count</p>
                {alertsSummary.topDrivers.map((d) => (
                  <BarRow key={d.driverId} label={d.driverName ?? "Unknown"} count={d.count} maxCount={maxDriverCount} />
                ))}
              </div>
            ) : null}
            {alertsSummary.total === 0 ? <p className="text-sm text-neutral-500">No incidents in this range.</p> : null}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">SMS volume</h2>
            <p>
              <span className="text-xl font-semibold text-neutral-800">{smsCount}</span>{" "}
              <span className="text-sm text-neutral-600">simulated texts sent</span>
            </p>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
