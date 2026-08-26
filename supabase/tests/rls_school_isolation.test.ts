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
  setProfileSchool,
  signIn,
  uniqueSuffix
} from "./helpers";

// Formalizes the multi-school-isolation check CLAUDE.md says was verified
// live once by hand (a second school+admin created via the service-role
// client saw zero rows across buses/students/alerts/trips belonging to
// school 1) into a repeatable regression test. An admin's RLS scoping is
// `school_id = current_school_id()`, computed server-side from the caller's
// own profile -- this specifically checks that passing the *other*
// school's id in the query string doesn't bypass that.
describe("RLS: schools are isolated from each other", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  const userIds: string[] = [];
  let schoolAId: string, schoolBId: string;
  let adminAId: string;
  let adminAToken: string;
  let studentAId: string, busAId: string, routeAId: string;
  let studentBId: string, routeBId: string;

  beforeAll(async () => {
    schoolAId = await createSchool(`Isolation Test School A ${suffix}`);
    schoolBId = await createSchool(`Isolation Test School B ${suffix}`);

    adminAId = await createUser(`iso-admin-a-${suffix}@example.com`, password, { full_name: "Admin A", role: "admin" });
    const driverAId = await createUser(`iso-driver-a-${suffix}@example.com`, password, { full_name: "Driver A", role: "driver" });
    const driverBId = await createUser(`iso-driver-b-${suffix}@example.com`, password, { full_name: "Driver B", role: "driver" });
    userIds.push(adminAId, driverAId, driverBId);

    await setProfileSchool(adminAId, schoolAId);
    await setProfileSchool(driverAId, schoolAId);
    await setProfileSchool(driverBId, schoolBId);

    routeAId = await createRoute(schoolAId, "Isolation Route A");
    busAId = await createBus(schoolAId, "Isolation Bus A", driverAId, routeAId);
    studentAId = (await createStudent(schoolAId, "Alice", "SchoolA", routeAId)).id;

    routeBId = await createRoute(schoolBId, "Isolation Route B");
    await createBus(schoolBId, "Isolation Bus B", driverBId, routeBId);
    studentBId = (await createStudent(schoolBId, "Bob", "SchoolB", routeBId)).id;

    adminAToken = await signIn(`iso-admin-a-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolAId);
    await deleteSchool(schoolBId);
    for (const id of userIds) await deleteUser(id);
  });

  it("school A's admin can see school A's own data", async () => {
    const studentsRes = await asUser(adminAToken, `/rest/v1/students?school_id=eq.${schoolAId}&select=id`);
    expect(studentsRes.body.map((s: { id: string }) => s.id)).toContain(studentAId);

    const busesRes = await asUser(adminAToken, `/rest/v1/buses?school_id=eq.${schoolAId}&select=id`);
    expect(busesRes.body.map((b: { id: string }) => b.id)).toContain(busAId);

    const routesRes = await asUser(adminAToken, `/rest/v1/routes?school_id=eq.${schoolAId}&select=id`);
    expect(routesRes.body.map((r: { id: string }) => r.id)).toContain(routeAId);
  });

  it("school A's admin sees zero rows when explicitly querying school B's students", async () => {
    const res = await asUser(adminAToken, `/rest/v1/students?school_id=eq.${schoolBId}&select=id`);
    expect(res.body).toEqual([]);
  });

  it("school A's admin sees zero rows when explicitly querying school B's buses", async () => {
    const res = await asUser(adminAToken, `/rest/v1/buses?school_id=eq.${schoolBId}&select=id`);
    expect(res.body).toEqual([]);
  });

  it("school A's admin sees zero rows when explicitly querying school B's routes", async () => {
    const res = await asUser(adminAToken, `/rest/v1/routes?school_id=eq.${schoolBId}&select=id`);
    expect(res.body).toEqual([]);
  });

  it("school A's admin cannot fetch school B's student directly by id", async () => {
    const res = await asUser(adminAToken, `/rest/v1/students?id=eq.${studentBId}&select=id`);
    expect(res.body).toEqual([]);
  });

  it("school A's admin cannot fetch school B's own schools row beyond its own", async () => {
    const res = await asUser(adminAToken, `/rest/v1/schools?id=eq.${schoolBId}&select=id`);
    expect(res.body).toEqual([]);
  });
});
