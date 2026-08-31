/**
 * Pure merge + on-time logic for a parent's per-student trip history
 * (apps/family/src/app/parent/[studentId]/history). Takes two already-fetched
 * row sets (see queries/students.ts's getTripHistoryForStudent) and produces
 * a per-trip list -- no Supabase client, fully unit-testable in isolation.
 * Mirrors the admin on-time-performance feature's deviation logic
 * (reports.ts's zonedTimeToUtc/summarizeOnTime) but shaped as a per-day list
 * for one student rather than a school-wide byRoute aggregate.
 */

import { zonedTimeToUtc } from "./reports";

export interface TripHistoryAttendanceRow {
  trip_id: string;
  status: string;
  trip_date: string;
  direction: "pickup" | "dropoff";
  trip_status: string;
}

export interface TripHistoryCheckInRow {
  trip_id: string;
  event_type: "board" | "alight";
  occurred_at: string;
  stop_name: string | null;
  scheduled_time: string | null;
}

export type OnTimeStatus = "on_time" | "late" | "early";

export interface TripHistoryEntry {
  tripId: string;
  date: string;
  direction: "pickup" | "dropoff";
  tripStatus: string;
  attendanceStatus: string;
  stopName: string | null;
  checkedInAt: string | null;
  onTimeStatus: OnTimeStatus | null;
  deviationMinutes: number | null;
}

export function buildTripHistory(
  attendanceRows: TripHistoryAttendanceRow[],
  checkInRows: TripHistoryCheckInRow[],
  timeZone: string,
  thresholdMinutes = 5
): TripHistoryEntry[] {
  const checkInByTrip = new Map<string, TripHistoryCheckInRow>();
  for (const c of checkInRows) checkInByTrip.set(c.trip_id, c);

  const entries = attendanceRows.map((a): TripHistoryEntry => {
    const checkIn = checkInByTrip.get(a.trip_id);
    let onTimeStatus: OnTimeStatus | null = null;
    let deviationMinutes: number | null = null;

    if (checkIn?.scheduled_time) {
      const scheduledInstant = zonedTimeToUtc(a.trip_date, checkIn.scheduled_time, timeZone);
      const actualInstant = new Date(checkIn.occurred_at);
      deviationMinutes = (actualInstant.getTime() - scheduledInstant.getTime()) / 60_000;
      onTimeStatus = Math.abs(deviationMinutes) <= thresholdMinutes ? "on_time" : deviationMinutes > 0 ? "late" : "early";
    }

    return {
      tripId: a.trip_id,
      date: a.trip_date,
      direction: a.direction,
      tripStatus: a.trip_status,
      attendanceStatus: a.status,
      stopName: checkIn?.stop_name ?? null,
      checkedInAt: checkIn?.occurred_at ?? null,
      onTimeStatus,
      deviationMinutes
    };
  });

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
