import { adminQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAlertDirect,
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
  setProfileSchool,
  signInClient,
  uniqueSuffix
} from "./helpers";

// Exercises the actual query functions the Reports page calls (not a
// hand-written re-implementation of the same REST calls) so a bug in the
// real embed/select string -- e.g. the trips<->buses FK ambiguity bf90478
// had to fix -- would show up here.
describe("admin reports fetchers", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let adminClient: SabiDriveSupabaseClient;
  let driverId: string;
  let routeId: string;
  let stopId: string;
  let sinceISODate: string;
  let onTimeOccurredAt: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Reports Test School ${suffix}`);

    const adminId = await createUser(`rpt-admin-${suffix}@example.com`, password, { full_name: "Reports Admin", role: "admin" });
    driverId = await createUser(`rpt-driver-${suffix}@example.com`, password, { full_name: "Reports Driver", role: "driver" });
    userIds.push(adminId, driverId);
    await setProfileSchool(adminId, schoolId);
    await setProfileSchool(driverId, schoolId);

    routeId = await createRoute(schoolId, "Reports Test Route");
    const busId = await createBus(schoolId, "Reports Test Bus", driverId, routeId);
    const student = await createStudent(schoolId, "Report", "Kid", routeId);
    stopId = await createStop(schoolId, routeId, "Reports Test Stop", 1, "08:00:00");

    const today = new Date().toISOString().slice(0, 10);
    sinceISODate = today;

    const completedTripId = await createTripDirect({
      schoolId,
      busId,
      routeId,
      driverId,
      status: "completed",
      tripDate: today,
      startedAt: "2026-01-01T08:00:00Z",
      endedAt: "2026-01-01T08:30:00Z"
    });
    await createTripDirect({ schoolId, busId, routeId, driverId, status: "cancelled", tripDate: today });

    await createAttendanceDirect(completedTripId, student.id, "boarded");

    await createAlertDirect({ schoolId, tripId: completedTripId, type: "speeding", severity: "warning" });
    await createAlertDirect({ schoolId, tripId: completedTripId, type: "sos", severity: "critical", resolvedAt: new Date().toISOString() });

    // School timezone is Africa/Lagos (UTC+1, no DST), stop scheduled_time is 08:00 local
    // -> 07:00 UTC. 3 min after that, well within any reasonable on-time threshold.
    onTimeOccurredAt = `${today}T07:03:00Z`;
    await createCheckInEventDirect({
      tripId: completedTripId,
      studentId: student.id,
      stopId,
      eventType: "board",
      occurredAt: onTimeOccurredAt
    });

    adminClient = await signInClient(`rpt-admin-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("getTripsInRange returns the seeded trips with route names resolved", async () => {
    const trips = await adminQueries.getTripsInRange(adminClient, schoolId, sinceISODate);
    expect(trips).toHaveLength(2);
    expect(trips.filter((t) => t.status === "completed")).toHaveLength(1);
    expect(trips.filter((t) => t.status === "cancelled")).toHaveLength(1);
    expect(trips.every((t) => t.route_name === "Reports Test Route")).toBe(true);
  });

  it("getAttendanceInRange returns only this school's attendance rows via the trips join", async () => {
    const rows = await adminQueries.getAttendanceInRange(adminClient, schoolId, sinceISODate);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("boarded");
  });

  it("getAlertsInRange resolves the driver name through the nested trips embed", async () => {
    const alerts = await adminQueries.getAlertsInRange(adminClient, schoolId, sinceISODate);
    expect(alerts).toHaveLength(2);
    const sos = alerts.find((a) => a.type === "sos");
    expect(sos?.severity).toBe("critical");
    expect(sos?.driver_id).toBe(driverId);
    expect(sos?.driver_name).toBe("Reports Driver");
    expect(sos?.resolved_at).not.toBeNull();
  });

  it("getSmsCountInRange returns a number without throwing", async () => {
    const count = await adminQueries.getSmsCountInRange(adminClient, sinceISODate);
    expect(typeof count).toBe("number");
  });

  it("getOnTimeCheckInsInRange resolves the stop's scheduled_time and the trip's direction/route through the embeds", async () => {
    const rows = await adminQueries.getOnTimeCheckInsInRange(adminClient, schoolId, sinceISODate);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.stop_id).toBe(stopId);
    expect(row.event_type).toBe("board");
    expect(new Date(row.occurred_at).getTime()).toBe(new Date(onTimeOccurredAt).getTime());
    expect(row.direction).toBe("pickup");
    expect(row.route_id).toBe(routeId);
    expect(row.route_name).toBe("Reports Test Route");
    expect(row.scheduled_time).toBe("08:00:00");
  });
});
