import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createBus,
  createRoute,
  createSchool,
  createStudent,
  createUser,
  deleteSchool,
  deleteUser,
  linkGuardian,
  setProfileSchool,
  signIn,
  uniqueSuffix
} from "./helpers";

/**
 * Regression test for the return-leg (drop-off) fix: check_in() previously
 * only flipped attendance_expectations.status to 'boarded' on a 'board'
 * event, leaving an 'alight' event -- the only kind of check-in a genuine
 * dropoff-direction trip would ever record -- stuck at 'pending' forever.
 * This proves a real dropoff trip's attendance is now correctly fulfilled.
 */
describe("dropoff-direction trip", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let driverId: string, guardianId: string, studentId: string, qrToken: string;
  let driverToken: string, guardianToken: string, adminToken: string;
  let busId: string;
  let tripId: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Dropoff Trip Test School ${suffix}`);

    const adminId = await createUser(`do-admin-${suffix}@example.com`, password, { full_name: "DO Admin", role: "admin" });
    driverId = await createUser(`do-driver-${suffix}@example.com`, password, { full_name: "DO Driver", role: "driver" });
    guardianId = await createUser(`do-guardian-${suffix}@example.com`, password, { full_name: "DO Guardian", role: "parent" });
    userIds.push(adminId, driverId, guardianId);

    await setProfileSchool(adminId, schoolId);
    await setProfileSchool(driverId, schoolId);

    const routeId = await createRoute(schoolId, "Dropoff Test Route");
    busId = await createBus(schoolId, "Dropoff Test Bus", driverId, routeId);
    const student = await createStudent(schoolId, "Ride", "Home", routeId);
    studentId = student.id;
    qrToken = student.qrToken;
    await linkGuardian(guardianId, studentId);

    adminToken = await signIn(`do-admin-${suffix}@example.com`, password);
    driverToken = await signIn(`do-driver-${suffix}@example.com`, password);
    guardianToken = await signIn(`do-guardian-${suffix}@example.com`, password);

    const startRes = await asUser(driverToken, "/rest/v1/rpc/start_trip", {
      method: "POST",
      body: JSON.stringify({ p_bus_id: busId, p_direction: "dropoff" })
    });
    if (!startRes.ok) throw new Error(`start_trip failed: ${JSON.stringify(startRes.body)}`);
    tripId = startRes.body;
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("started with direction 'dropoff'", async () => {
    const res = await asUser(adminToken, `/rest/v1/trips?id=eq.${tripId}&select=direction`);
    expect(res.body[0].direction).toBe("dropoff");
  });

  it("an 'alight' check-in marks attendance 'alighted' (not stuck at 'pending') and notifies the guardian", async () => {
    const res = await asUser(driverToken, "/rest/v1/rpc/check_in", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId, p_qr_token: qrToken, p_event_type: "alight" })
    });
    expect(res.ok).toBe(true);

    const attendanceRes = await asUser(
      adminToken,
      `/rest/v1/attendance_expectations?trip_id=eq.${tripId}&student_id=eq.${studentId}&select=status`
    );
    expect(attendanceRes.body).toHaveLength(1);
    expect(attendanceRes.body[0].status).toBe("alighted");

    const notifRes = await asUser(
      guardianToken,
      `/rest/v1/notifications?recipient_id=eq.${guardianId}&type=eq.alighting&related_trip_id=eq.${tripId}&select=*`
    );
    expect(notifRes.body).toHaveLength(1);
    expect(notifRes.body[0].related_student_id).toBe(studentId);
  });

  it("end_trip does not mark the already-alighted student as missed", async () => {
    const endRes = await asUser(driverToken, "/rest/v1/rpc/end_trip", { method: "POST", body: JSON.stringify({ p_trip_id: tripId }) });
    expect(endRes.ok).toBe(true);

    const attendanceRes = await asUser(
      adminToken,
      `/rest/v1/attendance_expectations?trip_id=eq.${tripId}&student_id=eq.${studentId}&select=status`
    );
    expect(attendanceRes.body[0].status).toBe("alighted");
  });
});
