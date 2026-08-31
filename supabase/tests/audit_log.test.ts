import { adminQueries } from "@sabidrive/supabase";
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

interface AuditRow {
  action: string;
  target_id: string | null;
  details: Record<string, unknown>;
  school_id: string;
}

describe("audit_log", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let otherSchoolId: string;
  const userIds: string[] = [];
  let adminClient: SabiDriveSupabaseClient;
  let otherAdminClient: SabiDriveSupabaseClient;
  let driverId: string;
  let routeForBus: string;

  async function auditRows(): Promise<AuditRow[]> {
    const r = await svc(`/rest/v1/audit_log?school_id=eq.${schoolId}&select=action,target_id,details,school_id`);
    return r.body as AuditRow[];
  }

  beforeAll(async () => {
    schoolId = await createSchool(`Audit Test School ${suffix}`);
    otherSchoolId = await createSchool(`Audit Test Other School ${suffix}`);

    const adminId = await createUser(`audit-admin-${suffix}@example.com`, password, { full_name: "Audit Admin", role: "admin" });
    userIds.push(adminId);
    await setProfileSchool(adminId, schoolId);
    adminClient = await signInClient(`audit-admin-${suffix}@example.com`, password);

    const otherAdminId = await createUser(`audit-other-admin-${suffix}@example.com`, password, {
      full_name: "Other Admin",
      role: "admin"
    });
    userIds.push(otherAdminId);
    await setProfileSchool(otherAdminId, otherSchoolId);
    otherAdminClient = await signInClient(`audit-other-admin-${suffix}@example.com`, password);

    driverId = await createUser(`audit-driver-${suffix}@example.com`, password, { full_name: "Audit Driver", role: "driver" });
    userIds.push(driverId);
    await setProfileSchool(driverId, schoolId);

    routeForBus = await createRoute(schoolId, `Bus Route ${suffix}`);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    await deleteSchool(otherSchoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("logs a route_deleted row when an admin deletes a route", async () => {
    const routeId = await createRoute(schoolId, `To Delete ${suffix}`);
    await adminQueries.deleteRoute(adminClient, routeId);

    const rows = await auditRows();
    const match = rows.find((r) => r.action === "route_deleted" && r.target_id === routeId);
    expect(match).toBeDefined();
    expect(match!.details.name).toBe(`To Delete ${suffix}`);
  });

  it("logs a bus_deleted row when an admin deletes a bus with no trip history", async () => {
    const busId = await createBus(schoolId, `Bus To Delete ${suffix}`, driverId, routeForBus);
    await adminQueries.deleteBus(adminClient, busId);

    const rows = await auditRows();
    const match = rows.find((r) => r.action === "bus_deleted" && r.target_id === busId);
    expect(match).toBeDefined();
    expect(match!.details.label).toBe(`Bus To Delete ${suffix}`);
  });

  it("logs bus_retired then bus_restored when an admin retires and restores a bus", async () => {
    const busId = await createBus(schoolId, `Bus To Retire ${suffix}`, driverId, routeForBus);
    await adminQueries.setBusRetired(adminClient, busId, true);
    await adminQueries.setBusRetired(adminClient, busId, false);

    const rows = await auditRows();
    expect(rows.find((r) => r.action === "bus_retired" && r.target_id === busId)).toBeDefined();
    expect(rows.find((r) => r.action === "bus_restored" && r.target_id === busId)).toBeDefined();
  });

  it("logs one guardian_removed row per linked student when a guardian is removed from the school", async () => {
    const guardianId = await createUser(`audit-guardian-${suffix}@example.com`, password, {
      full_name: "Audit Guardian",
      role: "parent"
    });
    userIds.push(guardianId);
    await setProfileSchool(guardianId, schoolId);

    const studentA = await createStudent(schoolId, "A", `Guardian${suffix}`, routeForBus);
    const studentB = await createStudent(schoolId, "B", `Guardian${suffix}`, routeForBus);
    await linkGuardian(guardianId, studentA.id);
    await linkGuardian(guardianId, studentB.id);

    await adminQueries.removeGuardianFromSchool(adminClient, guardianId);

    const rows = await auditRows();
    const removals = rows.filter((r) => r.action === "guardian_removed" && r.target_id === guardianId);
    expect(removals).toHaveLength(2);
    const studentIds = removals.map((r) => r.details.student_id);
    expect(studentIds).toContain(studentA.id);
    expect(studentIds).toContain(studentB.id);
  });

  it("does not let a different school's admin read this school's audit log (RLS)", async () => {
    const rows = await adminQueries.getAuditLog(otherAdminClient, schoolId);
    expect(rows).toHaveLength(0);
  });

  it("lets the owning admin read their own school's audit log", async () => {
    const rows = await adminQueries.getAuditLog(adminClient, schoolId);
    expect(rows.length).toBeGreaterThan(0);
  });
});
