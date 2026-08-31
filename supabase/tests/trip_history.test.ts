import { studentQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAttendanceDirect,
  createBus,
  createCheckInEventDirect,
  createRoute,
  createSchool,
  createStop,
  createStudent,
  createTripDirect,
  createUser,
  deleteSchool,
  deleteUser,
  linkGuardian,
  setProfileSchool,
  signInClient,
  uniqueSuffix
} from "./helpers";

describe("getTripHistoryForStudent", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let guardianClient: SabiDriveSupabaseClient;
  let otherGuardianClient: SabiDriveSupabaseClient;
  let studentId: string;
  let boardedTripId: string;
  let missedTripId: string;
  let sinceISODate: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Trip History Test School ${suffix}`);

    const driverId = await createUser(`hist-driver-${suffix}@example.com`, password, { full_name: "History Driver", role: "driver" });
    const guardianId = await createUser(`hist-guardian-${suffix}@example.com`, password, { full_name: "History Guardian", role: "parent" });
    const otherGuardianId = await createUser(`hist-other-${suffix}@example.com`, password, { full_name: "Other Guardian", role: "parent" });
    userIds.push(driverId, guardianId, otherGuardianId);
    await setProfileSchool(driverId, schoolId);

    const routeId = await createRoute(schoolId, "History Test Route");
    const busId = await createBus(schoolId, "History Test Bus", driverId, routeId);
    const stopId = await createStop(schoolId, routeId, "History Test Stop", 1, "08:00:00");

    const student = await createStudent(schoolId, "History", "Kid", routeId);
    studentId = student.id;
    await linkGuardian(guardianId, studentId);

    const today = new Date().toISOString().slice(0, 10);
    sinceISODate = today;

    boardedTripId = await createTripDirect({
      schoolId,
      busId,
      routeId,
      driverId,
      status: "completed",
      tripDate: today,
      startedAt: `${today}T08:00:00Z`,
      endedAt: `${today}T08:30:00Z`
    });
    await createAttendanceDirect(boardedTripId, studentId, "boarded");
    await createCheckInEventDirect({
      tripId: boardedTripId,
      studentId,
      stopId,
      eventType: "board",
      occurredAt: `${today}T07:02:00Z` // school timezone is Africa/Lagos (UTC+1), 08:00 local -> 07:00Z
    });

    missedTripId = await createTripDirect({ schoolId, busId, routeId, driverId, status: "completed", tripDate: today });
    await createAttendanceDirect(missedTripId, studentId, "missed");

    guardianClient = await signInClient(`hist-guardian-${suffix}@example.com`, password);
    otherGuardianClient = await signInClient(`hist-other-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("returns both the boarded and missed trips with the right shape", async () => {
    const { attendance, checkIns, timeZone } = await studentQueries.getTripHistoryForStudent(guardianClient, studentId, sinceISODate);
    expect(timeZone).toBe("Africa/Lagos");
    expect(attendance).toHaveLength(2);
    expect(attendance.some((a) => a.trip_id === boardedTripId && a.status === "boarded")).toBe(true);
    expect(attendance.some((a) => a.trip_id === missedTripId && a.status === "missed")).toBe(true);

    expect(checkIns).toHaveLength(1);
    expect(checkIns[0]!.trip_id).toBe(boardedTripId);
    expect(checkIns[0]!.stop_name).toBe("History Test Stop");
    expect(checkIns[0]!.scheduled_time).toBe("08:00:00");
  });

  it("rejects for a guardian not linked to this student (RLS boundary) -- they can't even read the student row", async () => {
    await expect(studentQueries.getTripHistoryForStudent(otherGuardianClient, studentId, sinceISODate)).rejects.toThrow();
  });
});
