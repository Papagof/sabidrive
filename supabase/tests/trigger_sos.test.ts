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

describe("trigger_sos", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let adminId: string, driverId: string, otherDriverId: string, guardianId: string, studentId: string;
  let adminToken: string, driverToken: string, otherDriverToken: string, guardianToken: string;
  let busId: string;
  let tripId: string;

  beforeAll(async () => {
    schoolId = await createSchool(`SOS Test School ${suffix}`);

    adminId = await createUser(`sos-admin-${suffix}@example.com`, password, { full_name: "SOS Admin", role: "admin" });
    driverId = await createUser(`sos-driver-${suffix}@example.com`, password, { full_name: "SOS Driver", role: "driver" });
    otherDriverId = await createUser(`sos-otherdriver-${suffix}@example.com`, password, { full_name: "Other Driver", role: "driver" });
    guardianId = await createUser(`sos-guardian-${suffix}@example.com`, password, { full_name: "SOS Guardian", role: "parent" });
    userIds.push(adminId, driverId, otherDriverId, guardianId);

    await setProfileSchool(adminId, schoolId);
    await setProfileSchool(driverId, schoolId);
    await setProfileSchool(otherDriverId, schoolId);

    const routeId = await createRoute(schoolId, "SOS Test Route");
    busId = await createBus(schoolId, "SOS Test Bus", driverId, routeId);
    const student = await createStudent(schoolId, "Test", "Kid", routeId);
    studentId = student.id;
    await linkGuardian(guardianId, studentId);

    adminToken = await signIn(`sos-admin-${suffix}@example.com`, password);
    driverToken = await signIn(`sos-driver-${suffix}@example.com`, password);
    otherDriverToken = await signIn(`sos-otherdriver-${suffix}@example.com`, password);
    guardianToken = await signIn(`sos-guardian-${suffix}@example.com`, password);

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

  it("rejects an unrelated driver", async () => {
    const res = await asUser(otherDriverToken, "/rest/v1/rpc/trigger_sos", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId })
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a guardian (non-crew)", async () => {
    const res = await asUser(guardianToken, "/rest/v1/rpc/trigger_sos", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId })
    });
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown trip id", async () => {
    const res = await asUser(driverToken, "/rest/v1/rpc/trigger_sos", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: "00000000-0000-0000-0000-000000000000" })
    });
    expect(res.ok).toBe(false);
  });

  it("lets the assigned driver trigger an SOS, which fans out correctly", async () => {
    const sosRes = await asUser(driverToken, "/rest/v1/rpc/trigger_sos", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId })
    });
    expect(sosRes.ok).toBe(true);

    const alertsRes = await asUser(adminToken, `/rest/v1/alerts?trip_id=eq.${tripId}&type=eq.sos&select=*`);
    expect(alertsRes.body).toHaveLength(1);
    expect(alertsRes.body[0].severity).toBe("critical");
    expect(alertsRes.body[0].payload.triggered_by).toBe(driverId);

    const adminNotifRes = await asUser(
      adminToken,
      `/rest/v1/notifications?recipient_id=eq.${adminId}&type=eq.sos&related_trip_id=eq.${tripId}&select=*`
    );
    expect(adminNotifRes.body).toHaveLength(1);

    const guardianNotifRes = await asUser(
      guardianToken,
      `/rest/v1/notifications?recipient_id=eq.${guardianId}&type=eq.sos&related_trip_id=eq.${tripId}&select=*`
    );
    expect(guardianNotifRes.body).toHaveLength(1);
    expect(guardianNotifRes.body[0].related_student_id).toBe(studentId);
  });

  it("rejects triggering once the trip is no longer in_progress", async () => {
    const endRes = await asUser(driverToken, "/rest/v1/rpc/end_trip", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId })
    });
    expect(endRes.ok).toBe(true);

    const postEndRes = await asUser(driverToken, "/rest/v1/rpc/trigger_sos", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId })
    });
    expect(postEndRes.ok).toBe(false);
  });
});
