import { adminQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRoute, createSchool, createStop, createUser, deleteSchool, deleteUser, setProfileSchool, signInClient, uniqueSuffix } from "./helpers";

describe("createStudentsBulk", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let otherSchoolId: string;
  const userIds: string[] = [];
  let adminClient: SabiDriveSupabaseClient;
  let routeId: string;
  let stopId: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Import Test School ${suffix}`);
    otherSchoolId = await createSchool(`Import Test Other School ${suffix}`);

    const adminId = await createUser(`import-admin-${suffix}@example.com`, password, { full_name: "Import Admin", role: "admin" });
    userIds.push(adminId);
    await setProfileSchool(adminId, schoolId);

    routeId = await createRoute(schoolId, "Import Test Route");
    stopId = await createStop(schoolId, routeId, "Import Test Stop", 1);

    adminClient = await signInClient(`import-admin-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    await deleteSchool(otherSchoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("inserts multiple students in one call, resolving route/stop assignment", async () => {
    const rows = await adminQueries.createStudentsBulk(adminClient, [
      { school_id: schoolId, first_name: "Jane", last_name: "Doe", grade: "5", default_route_id: routeId, default_stop_id: stopId },
      { school_id: schoolId, first_name: "Bob", last_name: "Smith", default_route_id: routeId, default_stop_id: null },
      { school_id: schoolId, first_name: "Alice", last_name: "Jones" }
    ]);
    expect(rows).toHaveLength(3);
    const jane = rows.find((r) => r.first_name === "Jane");
    expect(jane?.default_route_id).toBe(routeId);
    expect(jane?.default_stop_id).toBe(stopId);
    expect(jane?.qr_token).toBeTruthy();
    const alice = rows.find((r) => r.first_name === "Alice");
    expect(alice?.default_route_id).toBeNull();
  });

  it("rejects inserting into a different school", async () => {
    await expect(
      adminQueries.createStudentsBulk(adminClient, [{ school_id: otherSchoolId, first_name: "Nope", last_name: "Blocked" }])
    ).rejects.toThrow();
  });
});
