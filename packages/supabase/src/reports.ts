/**
 * Pure aggregation functions for the admin Reports page (apps/admin/src/app/reports).
 * Take already-fetched rows (see queries/admin.ts's *InRange fetchers) and return
 * summary objects -- no Supabase client, no network, fully unit-testable in
 * isolation. Mirrors packages/gps-sim's split between pure math (engine.ts) and
 * the I/O that feeds it (run-local.ts).
 */

export interface TripRow {
  status: string;
  route_id: string;
  route_name: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface TripsSummary {
  total: number;
  completed: number;
  cancelled: number;
  /** Average duration in minutes across completed trips that have both started_at and ended_at. */
  avgDurationMinutes: number | null;
  byRoute: { routeId: string; routeName: string | null; count: number }[];
}

export function summarizeTrips(trips: TripRow[]): TripsSummary {
  const completed = trips.filter((t) => t.status === "completed");
  const cancelled = trips.filter((t) => t.status === "cancelled");

  const durationsMinutes = completed
    .filter((t) => t.started_at && t.ended_at)
    .map((t) => (new Date(t.ended_at!).getTime() - new Date(t.started_at!).getTime()) / 60_000);
  const avgDurationMinutes =
    durationsMinutes.length > 0 ? durationsMinutes.reduce((a, b) => a + b, 0) / durationsMinutes.length : null;

  const byRouteMap = new Map<string, { routeName: string | null; count: number }>();
  for (const t of trips) {
    const existing = byRouteMap.get(t.route_id);
    if (existing) existing.count += 1;
    else byRouteMap.set(t.route_id, { routeName: t.route_name, count: 1 });
  }
  const byRoute = Array.from(byRouteMap.entries())
    .map(([routeId, v]) => ({ routeId, routeName: v.routeName, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return { total: trips.length, completed: completed.length, cancelled: cancelled.length, avgDurationMinutes, byRoute };
}

export interface AttendanceRow {
  status: string;
}

export interface AttendanceSummary {
  total: number;
  boarded: number;
  missed: number;
  excused: number;
  pending: number;
  boardedPct: number;
  missedPct: number;
}

export function summarizeAttendance(rows: AttendanceRow[]): AttendanceSummary {
  const total = rows.length;
  const boarded = rows.filter((r) => r.status === "boarded").length;
  const missed = rows.filter((r) => r.status === "missed").length;
  const excused = rows.filter((r) => r.status === "excused").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  return {
    total,
    boarded,
    missed,
    excused,
    pending,
    boardedPct: total > 0 ? (boarded / total) * 100 : 0,
    missedPct: total > 0 ? (missed / total) * 100 : 0
  };
}

export interface AlertRow {
  type: string;
  severity: string;
  resolved_at: string | null;
  driver_id: string | null;
  driver_name: string | null;
}

export interface AlertsSummary {
  total: number;
  byType: { type: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  resolvedPct: number;
  topDrivers: { driverId: string; driverName: string | null; count: number }[];
}

export function summarizeAlerts(rows: AlertRow[]): AlertsSummary {
  const total = rows.length;

  const typeMap = new Map<string, number>();
  const severityMap = new Map<string, number>();
  const driverMap = new Map<string, { driverName: string | null; count: number }>();
  let resolved = 0;

  for (const r of rows) {
    typeMap.set(r.type, (typeMap.get(r.type) ?? 0) + 1);
    severityMap.set(r.severity, (severityMap.get(r.severity) ?? 0) + 1);
    if (r.resolved_at) resolved += 1;
    if (r.driver_id) {
      const existing = driverMap.get(r.driver_id);
      if (existing) existing.count += 1;
      else driverMap.set(r.driver_id, { driverName: r.driver_name, count: 1 });
    }
  }

  const byType = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const bySeverity = Array.from(severityMap.entries())
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count);
  const topDrivers = Array.from(driverMap.entries())
    .map(([driverId, v]) => ({ driverId, driverName: v.driverName, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { total, byType, bySeverity, resolvedPct: total > 0 ? (resolved / total) * 100 : 0, topDrivers };
}
