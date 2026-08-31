import { buildRouteManifest, tripQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createBus,
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

describe("getRouteManifest", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  const userIds: string[] = [];
  let driverClient: SabiDriveSupabaseClient;
  let otherDriverClient: SabiDriveSupabaseClient;
  let routeId: string;
  let stop1Id: string;
  let stop2Id: string;

  beforeAll(async () => {
    schoolId = await createSchool(`Manifest Test School ${suffix}`);

    const driverId = await createUser(`manifest-driver-${suffix}@example.com`, password, { full_name: "Manifest Driver", role: "driver" });
    const otherDriverId = await createUser(`manifest-other-${suffix}@example.com`, password, { full_name: "Other Driver", role: "driver" });
    userIds.push(driverId, otherDriverId);
    await setProfileSchool(driverId, schoolId);
    await setProfileSchool(otherDriverId, schoolId);

    routeId = await createRoute(schoolId, "Manifest Test Route");
    await createBus(schoolId, "Manifest Test Bus", driverId, routeId);
    // Other driver gets their own unrelated bus/route so they're a real driver, just not assigned here.
    const otherRouteId = await createRoute(schoolId, "Unrelated Route");
    await createBus(schoolId, "Other Bus", otherDriverId, otherRouteId);

    stop1Id = await createStop(schoolId, routeId, "First Stop", 1, "08:00:00");
    stop2Id = await createStop(schoolId, routeId, "Second Stop", 2, "08:10:00");

    const s1 = await createStudent(schoolId, "Jane", "Doe", routeId);
    await svc(`/rest/v1/students?id=eq.${s1.id}`, { method: "PATCH", body: JSON.stringify({ default_stop_id: stop1Id }) });
    const s2 = await createStudent(schoolId, "Bob", "Smith", routeId);
    await svc(`/rest/v1/students?id=eq.${s2.id}`, { method: "PATCH", body: JSON.stringify({ default_stop_id: stop2Id }) });
    await createStudent(schoolId, "Alice", "NoStop", routeId); // left with no default_stop_id

    driverClient = await signInClient(`manifest-driver-${suffix}@example.com`, password);
    otherDriverClient = await signInClient(`manifest-other-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    await deleteSchool(schoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("returns the right stop/student grouping for the assigned driver", async () => {
    const { stops, students } = await tripQueries.getRouteManifest(driverClient, routeId);
    const manifest = buildRouteManifest(stops, students);
    expect(manifest.stops.map((s) => s.stopId)).toEqual([stop1Id, stop2Id]);
    expect(manifest.stops[0]!.students.map((s) => s.firstName)).toEqual(["Jane"]);
    expect(manifest.stops[1]!.students.map((s) => s.firstName)).toEqual(["Bob"]);
    expect(manifest.unassignedStudents.map((s) => s.firstName)).toEqual(["Alice"]);
  });

  it("returns nothing for a driver not assigned to this route (RLS boundary)", async () => {
    const { stops, students } = await tripQueries.getRouteManifest(otherDriverClient, routeId);
    expect(stops).toHaveLength(0);
    expect(students).toHaveLength(0);
  });
});
