import { adminQueries, studentQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createBus,
  createRoute,
  createSchool,
  createStudent,
  createUser,
  deleteSchool,
  deleteUser,
  linkGuardian,
  setProfileSchool,
  signInClient,
  svc,
  uniqueSuffix
} from "./helpers";

describe("student pickup address", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let adminClient: SabiDriveSupabaseClient;
  let guardianClient: SabiDriveSupabaseClient;
  const userIds: string[] = [];
  let driverId: string;
  let routeId: string;
  let studentId: string;
  let guardianId: string;
  let unrelatedStudentId: string;

  async function notificationsFor(recipientId: string) {
    const r = await svc(
      `/rest/v1/notifications?recipient_id=eq.${recipientId}&select=type,title,body,related_student_id&order=created_at.desc`
    );
    return r.body as { type: string; title: string; body: string; related_student_id: string | null }[];
  }

  beforeAll(async () => {
    schoolId = await createSchool(`Pickup Address Test School ${suffix}`);

    const adminId = await createUser(`pa-admin-${suffix}@example.com`, password, { full_name: "PA Admin", role: "admin" });
    userIds.push(adminId);
    await setProfileSchool(adminId, schoolId);
    adminClient = await signInClient(`pa-admin-${suffix}@example.com`, password);

    driverId = await createUser(`pa-driver-${suffix}@example.com`, password, { full_name: "PA Driver", role: "driver" });
    userIds.push(driverId);
    await setProfileSchool(driverId, schoolId);

    guardianId = await createUser(`pa-guardian-${suffix}@example.com`, password, { full_name: "PA Guardian", role: "parent" });
    userIds.push(guardianId);
    await setProfileSchool(guardianId, schoolId);
    guardianClient = await signInClient(`pa-guardian-${suffix}@example.com`, password);

    routeId = await createRoute(schoolId, `PA Route ${suffix}`);
    await createBus(schoolId, `PA Bus ${suffix}`, driverId, routeId);

    const student = await createStudent(schoolId, "PA", `Student${suffix}`, routeId);
    studentId = student.id;
    await linkGuardian(guardianId, studentId);

    const other = await createStudent(schoolId, "Unrelated", `Student${suffix}`, routeId);
    unrelatedStudentId = other.id;
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("lets a guardian update their own linked student's pickup address", async () => {
    await studentQueries.updateStudentPickupAddress(guardianClient, studentId, "123 New St");
    const r = await svc(`/rest/v1/students?id=eq.${studentId}&select=pickup_address`);
    expect(r.body[0].pickup_address).toBe("123 New St");
  });

  it("does not let a guardian update a student they are not linked to", async () => {
    await expect(studentQueries.updateStudentPickupAddress(guardianClient, unrelatedStudentId, "999 Nowhere Ave")).rejects.toThrow();
    const r = await svc(`/rest/v1/students?id=eq.${unrelatedStudentId}&select=pickup_address`);
    expect(r.body[0].pickup_address).toBeNull();
  });

  it("notifies every admin at the school when the address changes", async () => {
    await studentQueries.updateStudentPickupAddress(guardianClient, studentId, "456 Another Rd");
    const adminId = userIds.find((id) => id !== driverId && id !== guardianId)!;
    const notifs = await notificationsFor(adminId);
    const match = notifs.find((n) => n.type === "pickup_address_changed" && n.related_student_id === studentId);
    expect(match).toBeDefined();
    expect(match!.body).toBe("456 Another Rd");
  });

  it("notifies the linked guardian and the route's driver when the route/stop assignment changes", async () => {
    const otherRouteId = await createRoute(schoolId, `PA Route B ${suffix}`);
    // Move off routeId first (a route with no bus -- no driver to notify), then back onto
    // routeId (which does have a bus/driver), so the driver-notification path is exercised.
    await adminQueries.updateStudent(adminClient, studentId, { default_route_id: otherRouteId });
    await adminQueries.updateStudent(adminClient, studentId, { default_route_id: routeId });

    const guardianNotifs = await notificationsFor(guardianId);
    expect(guardianNotifs.filter((n) => n.type === "stop_assignment_changed" && n.related_student_id === studentId).length).toBeGreaterThanOrEqual(2);

    const driverNotifs = await notificationsFor(driverId);
    expect(driverNotifs.some((n) => n.type === "stop_assignment_changed" && n.related_student_id === studentId)).toBe(true);
  });
});
