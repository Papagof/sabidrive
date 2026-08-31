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

/**
 * Converts a school-local wall-clock date+time into the UTC instant it represents,
 * given an IANA timezone. No timezone library in this repo -- uses the standard
 * "format a candidate instant in the target zone, measure the offset, adjust" trick
 * via the built-in Intl API (what libraries like date-fns-tz do internally).
 *
 * Accepted simplification: single-pass, not iterated to convergence across a DST
 * transition boundary -- accurate everywhere except the specific hour of a DST
 * shift, an acceptable approximation for a school-bus schedule threshold (same
 * tradeoff class as packages/gps-sim/src/telemetry.ts's harsh-braking approximation).
 */
export function zonedTimeToUtc(dateISODate: string, timeHHMMSS: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateISODate}T${timeHHMMSS}Z`);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(naiveUtc)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUtcIfPartsWereUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const zoneOffsetMs = asUtcIfPartsWereUtc - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - zoneOffsetMs);
}

export interface OnTimeCheckInRow {
  trip_id: string;
  stop_id: string;
  event_type: "board" | "alight";
  occurred_at: string;
  trip_date: string;
  direction: "pickup" | "dropoff";
  route_id: string;
  route_name: string | null;
  scheduled_time: string | null;
}

export interface OnTimeSummary {
  total: number;
  onTime: number;
  late: number;
  early: number;
  onTimePct: number;
  avgDeviationMinutes: number | null;
  skippedNoSchedule: number;
  byRoute: { routeId: string; routeName: string | null; onTimePct: number; count: number }[];
}

export function summarizeOnTime(rows: OnTimeCheckInRow[], timeZone: string, thresholdMinutes = 5): OnTimeSummary {
  const expectedEventType = (direction: "pickup" | "dropoff") => (direction === "pickup" ? "board" : "alight");
  const matching = rows.filter((r) => r.event_type === expectedEventType(r.direction));

  // Group by (trip_id, stop_id), keeping the earliest occurred_at per group.
  const groups = new Map<
    string,
    { occurredAt: string; tripDate: string; scheduledTime: string | null; routeId: string; routeName: string | null }
  >();
  for (const r of matching) {
    const key = `${r.trip_id}:${r.stop_id}`;
    const existing = groups.get(key);
    if (!existing || r.occurred_at < existing.occurredAt) {
      groups.set(key, {
        occurredAt: r.occurred_at,
        tripDate: r.trip_date,
        scheduledTime: r.scheduled_time,
        routeId: r.route_id,
        routeName: r.route_name
      });
    }
  }

  let onTime = 0;
  let late = 0;
  let early = 0;
  let skippedNoSchedule = 0;
  const deviations: number[] = [];
  const byRouteMap = new Map<string, { routeName: string | null; onTimeCount: number; count: number }>();

  for (const g of groups.values()) {
    if (!g.scheduledTime) {
      skippedNoSchedule += 1;
      continue;
    }
    const scheduledInstant = zonedTimeToUtc(g.tripDate, g.scheduledTime, timeZone);
    const actualInstant = new Date(g.occurredAt);
    const deviationMinutes = (actualInstant.getTime() - scheduledInstant.getTime()) / 60_000;
    deviations.push(deviationMinutes);

    const isOnTime = Math.abs(deviationMinutes) <= thresholdMinutes;
    if (isOnTime) onTime += 1;
    else if (deviationMinutes > 0) late += 1;
    else early += 1;

    const routeEntry = byRouteMap.get(g.routeId) ?? { routeName: g.routeName, onTimeCount: 0, count: 0 };
    routeEntry.count += 1;
    if (isOnTime) routeEntry.onTimeCount += 1;
    byRouteMap.set(g.routeId, routeEntry);
  }

  const total = deviations.length;
  const byRoute = Array.from(byRouteMap.entries())
    .map(([routeId, v]) => ({
      routeId,
      routeName: v.routeName,
      onTimePct: v.count > 0 ? (v.onTimeCount / v.count) * 100 : 0,
      count: v.count
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    onTime,
    late,
    early,
    onTimePct: total > 0 ? (onTime / total) * 100 : 0,
    avgDeviationMinutes: deviations.length > 0 ? deviations.reduce((a, b) => a + b, 0) / deviations.length : null,
    skippedNoSchedule,
    byRoute
  };
}

/** Quotes a field if it contains a comma, quote, or newline; doubles up any internal quotes. */
function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(...cells: (string | number)[]): string {
  return cells.map(csvEscape).join(",");
}

export interface ReportsCsvParams {
  rangeLabel: string;
  generatedAtISODate: string;
  trips: TripsSummary;
  attendance: AttendanceSummary;
  alerts: AlertsSummary;
  onTime: OnTimeSummary;
  smsCount: number;
}

/** Builds the full Reports page export as CSV text -- same summary data already shown on screen, downloadable. */
export function buildReportsCsv(params: ReportsCsvParams): string {
  const { rangeLabel, generatedAtISODate, trips, attendance, alerts, onTime, smsCount } = params;
  const lines: string[] = [];

  lines.push(csvRow("SabiDrive Report", rangeLabel, generatedAtISODate));
  lines.push("");

  lines.push("Trips");
  lines.push(csvRow("Total", trips.total));
  lines.push(csvRow("Completed", trips.completed));
  lines.push(csvRow("Cancelled", trips.cancelled));
  lines.push(csvRow("Average duration (min)", trips.avgDurationMinutes != null ? Math.round(trips.avgDurationMinutes) : ""));
  if (trips.byRoute.length > 0) {
    lines.push("");
    lines.push("By Route");
    lines.push(csvRow("Route", "Count"));
    for (const r of trips.byRoute) lines.push(csvRow(r.routeName ?? "Unnamed route", r.count));
  }
  lines.push("");

  lines.push("Attendance");
  lines.push(csvRow("Total", attendance.total));
  lines.push(csvRow("Boarded", attendance.boarded));
  lines.push(csvRow("Missed", attendance.missed));
  lines.push(csvRow("Excused", attendance.excused));
  lines.push("");

  lines.push("Incidents");
  lines.push(csvRow("Total", alerts.total));
  lines.push(csvRow("Resolved %", Math.round(alerts.resolvedPct)));
  if (alerts.bySeverity.length > 0) {
    lines.push("");
    lines.push("By Severity");
    lines.push(csvRow("Severity", "Count"));
    for (const s of alerts.bySeverity) lines.push(csvRow(s.severity, s.count));
  }
  if (alerts.byType.length > 0) {
    lines.push("");
    lines.push("By Type");
    lines.push(csvRow("Type", "Count"));
    for (const t of alerts.byType) lines.push(csvRow(t.type, t.count));
  }
  if (alerts.topDrivers.length > 0) {
    lines.push("");
    lines.push("Top Drivers");
    lines.push(csvRow("Driver", "Count"));
    for (const d of alerts.topDrivers) lines.push(csvRow(d.driverName ?? "Unknown", d.count));
  }
  lines.push("");

  lines.push("On-Time Performance");
  lines.push(csvRow("Stops with data", onTime.total));
  lines.push(csvRow("On time %", Math.round(onTime.onTimePct)));
  lines.push(csvRow("Late", onTime.late));
  lines.push(csvRow("Early", onTime.early));
  lines.push(
    csvRow(
      "Average deviation (min)",
      onTime.avgDeviationMinutes != null ? Math.round(onTime.avgDeviationMinutes) : ""
    )
  );
  lines.push(csvRow("Stops with no scheduled time (excluded)", onTime.skippedNoSchedule));
  if (onTime.byRoute.length > 0) {
    lines.push("");
    lines.push("By Route");
    lines.push(csvRow("Route", "On time %", "Stops with data"));
    for (const r of onTime.byRoute) lines.push(csvRow(r.routeName ?? "Unnamed route", Math.round(r.onTimePct), r.count));
  }
  lines.push("");

  lines.push("SMS");
  lines.push(csvRow("Simulated texts sent", smsCount));

  return lines.join("\n");
}
