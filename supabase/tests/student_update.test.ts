import { adminQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRoute,
  createSchool,
  createStop,
  createStudent,
  createUser,
  deleteSchool,
  deleteUser,
  setProfileSchool,
  signInClient,
  svc,
  uniqueSuffix
} from "./helpers";

describe("updateStudent", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let otherSchoolId: string;
  const userIds: string[] = [];
  let adminClient: SabiDriveSupabaseClient;
  let routeId: string;
  let stopId: string;
  let studentId: string;
  let otherRouteId: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Update Student Test School ${suffix}`);
    otherSchoolId = await createSchool(`Update Student Test Other School ${suffix}`);

    const adminId = await createUser(`update-student-admin-${suffix}@example.com`, password, {
      full_name: "Update Student Admin",
      role: "admin"
    });
    userIds.push(adminId);
    await setProfileSchool(adminId, schoolId);
    adminClient = await signInClient(`update-student-admin-${suffix}@example.com`, password);

    routeId = await createRoute(schoolId, `Update Route ${suffix}`);
    stopId = await createStop(schoolId, routeId, `Update Stop ${suffix}`, 1);
    otherRouteId = await createRoute(otherSchoolId, `Update Other Route ${suffix}`);

    const student = await createStudent(schoolId, "Original", `Name${suffix}`, routeId);
    studentId = student.id;
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    await deleteSchool(otherSchoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("lets an admin update their own student's grade/route/stop", async () => {
    await adminQueries.updateStudent(adminClient, studentId, {
      grade: "5",
      default_route_id: routeId,
      default_stop_id: stopId
    });
    const r = await svc(`/rest/v1/students?id=eq.${studentId}&select=grade,default_route_id,default_stop_id`);
    expect(r.body[0].grade).toBe("5");
    expect(r.body[0].default_route_id).toBe(routeId);
    expect(r.body[0].default_stop_id).toBe(stopId);
  });

  it("does not let an admin update a student at a different school (RLS)", async () => {
    const otherStudent = await createStudent(otherSchoolId, "Other", `School${suffix}`, otherRouteId);
    await adminQueries.updateStudent(adminClient, otherStudent.id, { grade: "9" });
    const r = await svc(`/rest/v1/students?id=eq.${otherStudent.id}&select=grade`);
    expect(r.body[0].grade).toBeNull(); // unchanged
  });
});
