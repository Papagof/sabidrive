import { describe, expect, it } from "vitest";
import { summarizeAlerts, summarizeAttendance, summarizeTrips } from "./reports";
import type { AlertRow, AttendanceRow, TripRow } from "./reports";

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
