import { adminQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSchool, createUser, deleteSchool, deleteUser, setProfileSchool, signInClient, svc, uniqueSuffix } from "./helpers";

describe("on_time_threshold_minutes", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let otherSchoolId: string;
  const userIds: string[] = [];
  let adminClient: SabiDriveSupabaseClient;

  beforeAll(async () => {
    schoolId = await createSchool(`Threshold Test School ${suffix}`);
    otherSchoolId = await createSchool(`Threshold Test Other School ${suffix}`);

    const adminId = await createUser(`threshold-admin-${suffix}@example.com`, password, { full_name: "Threshold Admin", role: "admin" });
    userIds.push(adminId);
    await setProfileSchool(adminId, schoolId);

    adminClient = await signInClient(`threshold-admin-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    await deleteSchool(otherSchoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("defaults to 5 for a newly created school", async () => {
    const r = await svc(`/rest/v1/schools?id=eq.${schoolId}&select=on_time_threshold_minutes`);
    expect(r.body[0].on_time_threshold_minutes).toBe(5);
  });

  it("lets an admin update their own school's threshold", async () => {
    await adminQueries.updateSchool(adminClient, schoolId, { on_time_threshold_minutes: 10 });
    const school = await adminQueries.getSchool(adminClient, schoolId);
    expect(school.on_time_threshold_minutes).toBe(10);
  });

  it("does not let an admin update a different school's threshold (RLS)", async () => {
    await adminQueries.updateSchool(adminClient, otherSchoolId, { on_time_threshold_minutes: 20 });
    const r = await svc(`/rest/v1/schools?id=eq.${otherSchoolId}&select=on_time_threshold_minutes`);
    expect(r.body[0].on_time_threshold_minutes).toBe(5); // unchanged
  });
});
