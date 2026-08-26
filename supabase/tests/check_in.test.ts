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

describe("check_in", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let driverId: string, otherDriverId: string, guardianId: string, studentId: string, qrToken: string;
  let driverToken: string, otherDriverToken: string, guardianToken: string, adminToken: string;
  let busId: string;
  let tripId: string;

  beforeAll(async () => {
    schoolId = await createSchool(`CheckIn Test School ${suffix}`);

    const adminId = await createUser(`ci-admin-${suffix}@example.com`, password, { full_name: "CI Admin", role: "admin" });
    driverId = await createUser(`ci-driver-${suffix}@example.com`, password, { full_name: "CI Driver", role: "driver" });
    otherDriverId = await createUser(`ci-otherdriver-${suffix}@example.com`, password, { full_name: "Other Driver", role: "driver" });
    guardianId = await createUser(`ci-guardian-${suffix}@example.com`, password, { full_name: "CI Guardian", role: "parent" });
    userIds.push(adminId, driverId, otherDriverId, guardianId);

    await setProfileSchool(adminId, schoolId);
    await setProfileSchool(driverId, schoolId);
    await setProfileSchool(otherDriverId, schoolId);

    const routeId = await createRoute(schoolId, "CheckIn Test Route");
    busId = await createBus(schoolId, "CheckIn Test Bus", driverId, routeId);
    const student = await createStudent(schoolId, "Board", "Kid", routeId);
    studentId = student.id;
    qrToken = student.qrToken;
    await linkGuardian(guardianId, studentId);

    adminToken = await signIn(`ci-admin-${suffix}@example.com`, password);
    driverToken = await signIn(`ci-driver-${suffix}@example.com`, password);
    otherDriverToken = await signIn(`ci-otherdriver-${suffix}@example.com`, password);
    guardianToken = await signIn(`ci-guardian-${suffix}@example.com`, password);

    const startRes = await asUser(driverToken, "/rest/v1/rpc/start_trip", {
      method: "POST",
      body: JSON.stringify({ p_bus_id: busId, p_direction: "pickup" })
    });
    if (!startRes.ok) throw new Error(`start_trip failed: ${JSON.stringify(startRes.body)}`);
    tripId = startRes.body;
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("rejects a driver not assigned to this trip's bus", async () => {
    const res = await asUser(otherDriverToken, "/rest/v1/rpc/check_in", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId, p_qr_token: qrToken, p_event_type: "board" })
    });
    expect(res.ok).toBe(false);
  });

  it("rejects an unrecognized QR token", async () => {
    const res = await asUser(driverToken, "/rest/v1/rpc/check_in", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId, p_qr_token: "00000000-0000-0000-0000-000000000000", p_event_type: "board" })
    });
    expect(res.ok).toBe(false);
  });

  it("lets the assigned driver check the student in, flips attendance, and notifies the guardian", async () => {
    const res = await asUser(driverToken, "/rest/v1/rpc/check_in", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId, p_qr_token: qrToken, p_event_type: "board" })
    });
    expect(res.ok).toBe(true);

    const attendanceRes = await asUser(
      adminToken,
      `/rest/v1/attendance_expectations?trip_id=eq.${tripId}&student_id=eq.${studentId}&select=status`
    );
    expect(attendanceRes.body).toHaveLength(1);
    expect(attendanceRes.body[0].status).toBe("boarded");

    const notifRes = await asUser(
      guardianToken,
      `/rest/v1/notifications?recipient_id=eq.${guardianId}&type=eq.boarding&related_trip_id=eq.${tripId}&select=*`
    );
    expect(notifRes.body).toHaveLength(1);
    expect(notifRes.body[0].related_student_id).toBe(studentId);
  });

  it("rejects check-in once the trip is no longer in_progress", async () => {
    const endRes = await asUser(driverToken, "/rest/v1/rpc/end_trip", { method: "POST", body: JSON.stringify({ p_trip_id: tripId }) });
    expect(endRes.ok).toBe(true);

    const res = await asUser(driverToken, "/rest/v1/rpc/check_in", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId, p_qr_token: qrToken, p_event_type: "alight" })
    });
    expect(res.ok).toBe(false);
  });
});
