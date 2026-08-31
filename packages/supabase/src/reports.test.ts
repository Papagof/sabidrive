import { describe, expect, it } from "vitest";
import { buildReportsCsv, summarizeAlerts, summarizeAttendance, summarizeOnTime, summarizeTrips, zonedTimeToUtc } from "./reports";
import type {
  AlertRow,
  AttendanceRow,
  AlertsSummary,
  AttendanceSummary,
  OnTimeCheckInRow,
  OnTimeSummary,
  TripRow,
  TripsSummary
} from "./reports";

describe("summarizeTrips", () => {
  it("counts completed/cancelled and computes average duration", () => {
    const trips: TripRow[] = [
      { status: "completed", route_id: "r1", route_name: "Route 1", started_at: "2026-01-01T08:00:00Z", ended_at: "2026-01-01T08:30:00Z" },
      { status: "completed", route_id: "r1", route_name: "Route 1", started_at: "2026-01-01T08:00:00Z", ended_at: "2026-01-01T08:20:00Z" },
      { status: "cancelled", route_id: "r2", route_name: "Route 2", started_at: null, ended_at: null }
    ];
    const summary = summarizeTrips(trips);
    expect(summary.total).toBe(3);
    expect(summary.completed).toBe(2);
    expect(summary.cancelled).toBe(1);
    expect(summary.avgDurationMinutes).toBe(25); // (30 + 20) / 2
  });

  it("groups by route, sorted by count descending", () => {
    const trips: TripRow[] = [
      { status: "completed", route_id: "r1", route_name: "Route 1", started_at: null, ended_at: null },
      { status: "completed", route_id: "r1", route_name: "Route 1", started_at: null, ended_at: null },
      { status: "completed", route_id: "r2", route_name: "Route 2", started_at: null, ended_at: null }
    ];
    const summary = summarizeTrips(trips);
    expect(summary.byRoute).toEqual([
      { routeId: "r1", routeName: "Route 1", count: 2 },
      { routeId: "r2", routeName: "Route 2", count: 1 }
    ]);
  });

  it("returns null average duration when there are no completed trips with both timestamps", () => {
    const trips: TripRow[] = [{ status: "cancelled", route_id: "r1", route_name: null, started_at: null, ended_at: null }];
    expect(summarizeTrips(trips).avgDurationMinutes).toBeNull();
  });

  it("handles an empty range", () => {
    expect(summarizeTrips([])).toEqual({ total: 0, completed: 0, cancelled: 0, avgDurationMinutes: null, byRoute: [] });
  });
});

describe("summarizeAttendance", () => {
  it("computes counts and percentages", () => {
    const rows: AttendanceRow[] = [
      { status: "boarded" },
      { status: "boarded" },
      { status: "boarded" },
      { status: "missed" },
      { status: "excused" },
      { status: "pending" }
    ];
    const summary = summarizeAttendance(rows);
    expect(summary.total).toBe(6);
    expect(summary.boarded).toBe(3);
    expect(summary.missed).toBe(1);
    expect(summary.excused).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.boardedPct).toBeCloseTo(50, 6);
    expect(summary.missedPct).toBeCloseTo(16.6667, 3);
  });

  it("returns 0% for an empty range rather than dividing by zero", () => {
    const summary = summarizeAttendance([]);
    expect(summary.boardedPct).toBe(0);
    expect(summary.missedPct).toBe(0);
  });
});

describe("summarizeAlerts", () => {
  const rows: AlertRow[] = [
    { type: "speeding", severity: "warning", resolved_at: "2026-01-01T00:00:00Z", driver_id: "d1", driver_name: "Alice" },
    { type: "speeding", severity: "warning", resolved_at: null, driver_id: "d1", driver_name: "Alice" },
    { type: "harsh_brake", severity: "warning", resolved_at: null, driver_id: "d2", driver_name: "Bob" },
    { type: "sos", severity: "critical", resolved_at: "2026-01-01T00:00:00Z", driver_id: "d1", driver_name: "Alice" },
    { type: "attendance_mismatch", severity: "warning", resolved_at: null, driver_id: null, driver_name: null }
  ];

  it("breaks down by type and severity, most common first", () => {
    const summary = summarizeAlerts(rows);
    expect(summary.total).toBe(5);
    expect(summary.byType[0]).toEqual({ type: "speeding", count: 2 });
    expect(summary.bySeverity.find((s) => s.severity === "warning")?.count).toBe(4);
    expect(summary.bySeverity.find((s) => s.severity === "critical")?.count).toBe(1);
  });

  it("computes resolvedPct across all alerts including those with no driver", () => {
    const summary = summarizeAlerts(rows);
    expect(summary.resolvedPct).toBeCloseTo(40, 6); // 2 of 5 resolved
  });

  it("ranks drivers by incident count and excludes alerts with no driver", () => {
    const summary = summarizeAlerts(rows);
    expect(summary.topDrivers[0]).toEqual({ driverId: "d1", driverName: "Alice", count: 3 });
    expect(summary.topDrivers[1]).toEqual({ driverId: "d2", driverName: "Bob", count: 1 });
    expect(summary.topDrivers).toHaveLength(2);
  });

  it("caps topDrivers at 5", () => {
    const manyDrivers: AlertRow[] = Array.from({ length: 8 }, (_, i) => ({
      type: "speeding",
      severity: "warning",
      resolved_at: null,
      driver_id: `d${i}`,
      driver_name: `Driver ${i}`
    }));
    expect(summarizeAlerts(manyDrivers).topDrivers).toHaveLength(5);
  });

  it("handles an empty range", () => {
    expect(summarizeAlerts([])).toEqual({ total: 0, byType: [], bySeverity: [], resolvedPct: 0, topDrivers: [] });
  });
});

describe("buildReportsCsv", () => {
  const trips: TripsSummary = {
    total: 2,
    completed: 1,
    cancelled: 1,
    avgDurationMinutes: 25,
    byRoute: [{ routeId: "r1", routeName: "Route 1", count: 2 }]
  };
  const attendance: AttendanceSummary = {
    total: 10,
    boarded: 8,
    missed: 1,
    excused: 1,
    pending: 0,
    boardedPct: 80,
    missedPct: 10
  };
  const alerts: AlertsSummary = {
    total: 3,
    byType: [{ type: "speeding", count: 2 }],
    bySeverity: [{ severity: "warning", count: 3 }],
    resolvedPct: 100,
    topDrivers: [{ driverId: "d1", driverName: "Jane Doe", count: 3 }]
  };
  const onTime: OnTimeSummary = {
    total: 5,
    onTime: 4,
    late: 1,
    early: 0,
    onTimePct: 80,
    avgDeviationMinutes: 2,
    skippedNoSchedule: 1,
    byRoute: [{ routeId: "r1", routeName: "Route 1", onTimePct: 80, count: 5 }]
  };

  it("includes every section with correct headers and values", () => {
    const csv = buildReportsCsv({
      rangeLabel: "30d",
      generatedAtISODate: "2026-08-31",
      trips,
      attendance,
      alerts,
      onTime,
      smsCount: 42
    });
    const lines = csv.split("\n");
    expect(lines[0]).toBe("SabiDrive Report,30d,2026-08-31");
    expect(csv).toContain("Trips");
    expect(csv).toContain("Total,2");
    expect(csv).toContain("Average duration (min),25");
    expect(csv).toContain("By Route");
    expect(csv).toContain("Route 1,2");
    expect(csv).toContain("Attendance");
    expect(csv).toContain("Boarded,8");
    expect(csv).toContain("Incidents");
    expect(csv).toContain("Resolved %,100");
    expect(csv).toContain("By Severity");
    expect(csv).toContain("warning,3");
    expect(csv).toContain("By Type");
    expect(csv).toContain("speeding,2");
    expect(csv).toContain("Top Drivers");
    expect(csv).toContain("Jane Doe,3");
    expect(csv).toContain("On-Time Performance");
    expect(csv).toContain("On time %,80");
    expect(csv).toContain("Stops with no scheduled time (excluded),1");
    expect(csv).toContain("SMS");
    expect(csv).toContain("Simulated texts sent,42");
  });

  it("quotes a route/driver name containing a comma", () => {
    const csv = buildReportsCsv({
      rangeLabel: "7d",
      generatedAtISODate: "2026-08-31",
      trips: { ...trips, byRoute: [{ routeId: "r1", routeName: "Elm St, North Loop", count: 4 }] },
      attendance,
      alerts: { ...alerts, topDrivers: [{ driverId: "d1", driverName: "Doe, Jane", count: 1 }] },
      onTime,
      smsCount: 0
    });
    expect(csv).toContain('"Elm St, North Loop",4');
    expect(csv).toContain('"Doe, Jane",1');
  });

  it("handles an all-empty range without crashing or emitting sub-tables", () => {
    const emptyTrips: TripsSummary = { total: 0, completed: 0, cancelled: 0, avgDurationMinutes: null, byRoute: [] };
    const emptyAttendance: AttendanceSummary = {
      total: 0,
      boarded: 0,
      missed: 0,
      excused: 0,
      pending: 0,
      boardedPct: 0,
      missedPct: 0
    };
    const emptyAlerts: AlertsSummary = { total: 0, byType: [], bySeverity: [], resolvedPct: 0, topDrivers: [] };
    const emptyOnTime: OnTimeSummary = {
      total: 0,
      onTime: 0,
      late: 0,
      early: 0,
      onTimePct: 0,
      avgDeviationMinutes: null,
      skippedNoSchedule: 0,
      byRoute: []
    };
    const csv = buildReportsCsv({
      rangeLabel: "90d",
      generatedAtISODate: "2026-08-31",
      trips: emptyTrips,
      attendance: emptyAttendance,
      alerts: emptyAlerts,
      onTime: emptyOnTime,
      smsCount: 0
    });
    expect(csv).not.toContain("By Route");
    expect(csv).not.toContain("By Severity");
    expect(csv).not.toContain("By Type");
    expect(csv).not.toContain("Top Drivers");
    expect(csv).toContain("Average duration (min),");
    expect(csv).toContain("Average deviation (min),");
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a non-DST (CST, UTC-6) America/Chicago wall-clock time correctly", () => {
    const utc = zonedTimeToUtc("2026-01-15", "08:00:00", "America/Chicago");
    expect(utc.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("converts a DST (CDT, UTC-5) America/Chicago wall-clock time correctly", () => {
    const utc = zonedTimeToUtc("2026-07-15", "08:00:00", "America/Chicago");
    expect(utc.toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("returns the same instant for UTC itself", () => {
    const utc = zonedTimeToUtc("2026-03-01", "12:30:00", "UTC");
    expect(utc.toISOString()).toBe("2026-03-01T12:30:00.000Z");
  });
});

describe("summarizeOnTime", () => {
  const baseRow: OnTimeCheckInRow = {
    trip_id: "t1",
    stop_id: "s1",
    event_type: "board",
    occurred_at: "2026-01-15T14:00:00Z",
    trip_date: "2026-01-15",
    direction: "pickup",
    route_id: "r1",
    route_name: "Route 1",
    scheduled_time: "08:00:00"
  };

  it("counts a check-in within the threshold as on time", () => {
    const rows: OnTimeCheckInRow[] = [{ ...baseRow, occurred_at: "2026-01-15T14:02:00Z" }]; // 2 min late
    const summary = summarizeOnTime(rows, "America/Chicago");
    expect(summary.total).toBe(1);
    expect(summary.onTime).toBe(1);
    expect(summary.late).toBe(0);
    expect(summary.early).toBe(0);
  });

  it("is on time exactly at the threshold boundary", () => {
    const rows: OnTimeCheckInRow[] = [{ ...baseRow, occurred_at: "2026-01-15T14:05:00Z" }]; // exactly 5 min late
    const summary = summarizeOnTime(rows, "America/Chicago", 5);
    expect(summary.onTime).toBe(1);
    expect(summary.late).toBe(0);
  });

  it("counts a check-in past the threshold as late, and one before as early", () => {
    const late: OnTimeCheckInRow[] = [{ ...baseRow, occurred_at: "2026-01-15T14:10:00Z" }]; // 10 min late
    const early: OnTimeCheckInRow[] = [{ ...baseRow, occurred_at: "2026-01-15T13:45:00Z" }]; // 15 min early
    expect(summarizeOnTime(late, "America/Chicago").late).toBe(1);
    expect(summarizeOnTime(early, "America/Chicago").early).toBe(1);
  });

  it("ignores an event_type that doesn't match the trip's direction", () => {
    const rows: OnTimeCheckInRow[] = [{ ...baseRow, direction: "dropoff", event_type: "board" }];
    expect(summarizeOnTime(rows, "America/Chicago").total).toBe(0);
  });

  it("groups by (trip_id, stop_id) and keeps the earliest occurred_at", () => {
    const rows: OnTimeCheckInRow[] = [
      { ...baseRow, occurred_at: "2026-01-15T14:20:00Z" }, // 20 min late -- would be "late"
      { ...baseRow, occurred_at: "2026-01-15T14:02:00Z" } // 2 min late -- earliest, should win -- "on time"
    ];
    const summary = summarizeOnTime(rows, "America/Chicago");
    expect(summary.total).toBe(1);
    expect(summary.onTime).toBe(1);
  });

  it("excludes stops with no scheduled_time but counts them in skippedNoSchedule", () => {
    const rows: OnTimeCheckInRow[] = [{ ...baseRow, scheduled_time: null }];
    const summary = summarizeOnTime(rows, "America/Chicago");
    expect(summary.total).toBe(0);
    expect(summary.skippedNoSchedule).toBe(1);
  });

  it("computes byRoute on-time percentage", () => {
    const rows: OnTimeCheckInRow[] = [
      { ...baseRow, stop_id: "s1", occurred_at: "2026-01-15T14:02:00Z" }, // on time
      { ...baseRow, stop_id: "s2", occurred_at: "2026-01-15T14:20:00Z" } // late
    ];
    const summary = summarizeOnTime(rows, "America/Chicago");
    expect(summary.byRoute).toEqual([{ routeId: "r1", routeName: "Route 1", onTimePct: 50, count: 2 }]);
  });

  it("handles an empty range", () => {
    expect(summarizeOnTime([], "America/Chicago")).toEqual({
      total: 0,
      onTime: 0,
      late: 0,
      early: 0,
      onTimePct: 0,
      avgDeviationMinutes: null,
      skippedNoSchedule: 0,
      byRoute: []
    });
  });
});
