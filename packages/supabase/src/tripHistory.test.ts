import { describe, expect, it } from "vitest";
import { buildTripHistory } from "./tripHistory";
import type { TripHistoryAttendanceRow, TripHistoryCheckInRow } from "./tripHistory";

describe("buildTripHistory", () => {
  const baseAttendance: TripHistoryAttendanceRow = {
    trip_id: "t1",
    status: "boarded",
    trip_date: "2026-01-15",
    direction: "pickup",
    trip_status: "completed"
  };
  const baseCheckIn: TripHistoryCheckInRow = {
    trip_id: "t1",
    event_type: "board",
    occurred_at: "2026-01-15T14:00:00Z",
    stop_name: "Elm St",
    scheduled_time: "08:00:00" // America/Chicago -> 14:00Z (non-DST, matches reports.test.ts's known conversion)
  };

  it("marks an on-time boarding correctly", () => {
    const entries = buildTripHistory([baseAttendance], [{ ...baseCheckIn, occurred_at: "2026-01-15T14:02:00Z" }], "America/Chicago");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.onTimeStatus).toBe("on_time");
    expect(entries[0]!.attendanceStatus).toBe("boarded");
    expect(entries[0]!.stopName).toBe("Elm St");
  });

  it("marks a late boarding correctly", () => {
    const entries = buildTripHistory([baseAttendance], [{ ...baseCheckIn, occurred_at: "2026-01-15T14:10:00Z" }], "America/Chicago");
    expect(entries[0]!.onTimeStatus).toBe("late");
    expect(entries[0]!.deviationMinutes).toBe(10);
  });

  it("marks an early boarding correctly", () => {
    const entries = buildTripHistory([baseAttendance], [{ ...baseCheckIn, occurred_at: "2026-01-15T13:45:00Z" }], "America/Chicago");
    expect(entries[0]!.onTimeStatus).toBe("early");
  });

  it("still includes a missed trip (attendance row with no matching check-in)", () => {
    const missed: TripHistoryAttendanceRow = { ...baseAttendance, trip_id: "t2", status: "missed" };
    const entries = buildTripHistory([missed], [], "America/Chicago");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attendanceStatus).toBe("missed");
    expect(entries[0]!.checkedInAt).toBeNull();
    expect(entries[0]!.onTimeStatus).toBeNull();
  });

  it("leaves on-time fields null when the stop has no scheduled_time", () => {
    const entries = buildTripHistory([baseAttendance], [{ ...baseCheckIn, scheduled_time: null }], "America/Chicago");
    expect(entries[0]!.checkedInAt).not.toBeNull();
    expect(entries[0]!.onTimeStatus).toBeNull();
    expect(entries[0]!.deviationMinutes).toBeNull();
  });

  it("sorts entries most-recent-first", () => {
    const older: TripHistoryAttendanceRow = { ...baseAttendance, trip_id: "t-older", trip_date: "2026-01-10" };
    const newer: TripHistoryAttendanceRow = { ...baseAttendance, trip_id: "t-newer", trip_date: "2026-01-20" };
    const entries = buildTripHistory([older, newer], [], "America/Chicago");
    expect(entries.map((e) => e.tripId)).toEqual(["t-newer", "t-older"]);
  });

  it("handles an empty history", () => {
    expect(buildTripHistory([], [], "America/Chicago")).toEqual([]);
  });
});
