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

describe("trip_messages", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let driverAId: string, driverBId: string, guardianAId: string, guardianBId: string, guardianCId: string;
  let driverAToken: string, driverBToken: string, guardianAToken: string, guardianBToken: string, guardianCToken: string;
  let tripId: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Messages Test School ${suffix}`);

    driverAId = await createUser(`msg-drivera-${suffix}@example.com`, password, { full_name: "Msg DriverA", role: "driver" });
    driverBId = await createUser(`msg-driverb-${suffix}@example.com`, password, { full_name: "Msg DriverB", role: "driver" });
    guardianAId = await createUser(`msg-guardiana-${suffix}@example.com`, password, { full_name: "Msg GuardianA", role: "parent" });
    guardianBId = await createUser(`msg-guardianb-${suffix}@example.com`, password, { full_name: "Msg GuardianB", role: "parent" });
    guardianCId = await createUser(`msg-guardianc-${suffix}@example.com`, password, { full_name: "Msg GuardianC", role: "parent" });
    userIds.push(driverAId, driverBId, guardianAId, guardianBId, guardianCId);

    await setProfileSchool(driverAId, schoolId);
    await setProfileSchool(driverBId, schoolId);

    const routeId = await createRoute(schoolId, "Messages Test Route");
    const busId = await createBus(schoolId, "Messages Test Bus", driverAId, routeId);
    const studentA = await createStudent(schoolId, "Alpha", "Kid", routeId);
    const studentB = await createStudent(schoolId, "Beta", "Kid", routeId);
    await linkGuardian(guardianAId, studentA.id);
    await linkGuardian(guardianBId, studentB.id);

    // studentC is on a *different* route -- guardianC has no link to this trip.
    const otherRouteId = await createRoute(schoolId, "Unrelated Route");
    const studentC = await createStudent(schoolId, "Gamma", "Kid", otherRouteId);
    await linkGuardian(guardianCId, studentC.id);

    driverAToken = await signIn(`msg-drivera-${suffix}@example.com`, password);
    driverBToken = await signIn(`msg-driverb-${suffix}@example.com`, password);
    guardianAToken = await signIn(`msg-guardiana-${suffix}@example.com`, password);
    guardianBToken = await signIn(`msg-guardianb-${suffix}@example.com`, password);
    guardianCToken = await signIn(`msg-guardianc-${suffix}@example.com`, password);

    const startRes = await asUser(driverAToken, "/rest/v1/rpc/start_trip", {
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

  it("rejects a driver not on this trip's bus", async () => {
    const res = await asUser(driverBToken, "/rest/v1/trip_messages", {
      method: "POST",
      body: JSON.stringify({ trip_id: tripId, sender_id: driverBId, body: "sneaking in" })
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a guardian not on this trip's roster", async () => {
    const res = await asUser(guardianCToken, "/rest/v1/trip_messages", {
      method: "POST",
      body: JSON.stringify({ trip_id: tripId, sender_id: guardianCId, body: "sneaking in" })
    });
    expect(res.ok).toBe(false);
  });

  it("rejects an empty message body", async () => {
    const res = await asUser(driverAToken, "/rest/v1/trip_messages", {
      method: "POST",
      body: JSON.stringify({ trip_id: tripId, sender_id: driverAId, body: "" })
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a message body over 1000 characters", async () => {
    const res = await asUser(driverAToken, "/rest/v1/trip_messages", {
      method: "POST",
      body: JSON.stringify({ trip_id: tripId, sender_id: driverAId, body: "x".repeat(1001) })
    });
    expect(res.ok).toBe(false);
  });

  it("lets the driver post, sets sender_name server-side, and notifies every other participant but not the sender", async () => {
    const res = await asUser(driverAToken, "/rest/v1/trip_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ trip_id: tripId, sender_id: driverAId, body: "Running 5 min late", sender_name: "SPOOFED NAME" })
    });
    expect(res.ok).toBe(true);
    expect(res.body[0].sender_name).toBe("Msg DriverA");

    const guardianANotif = await asUser(
      guardianAToken,
      `/rest/v1/notifications?recipient_id=eq.${guardianAId}&type=eq.message&related_trip_id=eq.${tripId}&select=*`
    );
    expect(guardianANotif.body).toHaveLength(1);
    expect(guardianANotif.body[0].title).toBe("New message from Msg DriverA");

    const guardianBNotif = await asUser(
      guardianBToken,
      `/rest/v1/notifications?recipient_id=eq.${guardianBId}&type=eq.message&related_trip_id=eq.${tripId}&select=*`
    );
    expect(guardianBNotif.body).toHaveLength(1);

    const driverANotif = await asUser(
      driverAToken,
      `/rest/v1/notifications?recipient_id=eq.${driverAId}&type=eq.message&related_trip_id=eq.${tripId}&select=*`
    );
    expect(driverANotif.body).toHaveLength(0);
  });

  it("lets a guardian post, and notifies the driver + the other guardian but not the sender", async () => {
    const res = await asUser(guardianAToken, "/rest/v1/trip_messages", {
      method: "POST",
      body: JSON.stringify({ trip_id: tripId, sender_id: guardianAId, body: "OK thanks!" })
    });
    expect(res.ok).toBe(true);

    const driverANotif = await asUser(
      driverAToken,
      `/rest/v1/notifications?recipient_id=eq.${driverAId}&type=eq.message&related_trip_id=eq.${tripId}&select=*`
    );
    expect(driverANotif.body).toHaveLength(1);
    expect(driverANotif.body[0].title).toBe("New message from Msg GuardianA");

    const guardianBNotif = await asUser(
      guardianBToken,
      `/rest/v1/notifications?recipient_id=eq.${guardianBId}&type=eq.message&related_trip_id=eq.${tripId}&select=*`
    );
    expect(guardianBNotif.body).toHaveLength(2); // driver's earlier message + this one

    const guardianASecondNotifCheck = await asUser(
      guardianAToken,
      `/rest/v1/notifications?recipient_id=eq.${guardianAId}&type=eq.message&related_trip_id=eq.${tripId}&select=*`
    );
    expect(guardianASecondNotifCheck.body).toHaveLength(1); // still just the driver's message, not her own
  });

  it("every trip participant can read the full thread", async () => {
    const res = await asUser(guardianBToken, `/rest/v1/trip_messages?trip_id=eq.${tripId}&select=*&order=created_at.asc`);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((m: { body: string }) => m.body)).toEqual(["Running 5 min late", "OK thanks!"]);
  });
});
