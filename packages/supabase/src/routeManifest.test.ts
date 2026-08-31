import { describe, expect, it } from "vitest";
import { buildRouteManifest } from "./routeManifest";
import type { ManifestStopRow, ManifestStudentRow } from "./routeManifest";

describe("buildRouteManifest", () => {
  const stops: ManifestStopRow[] = [
    { id: "s2", name: "Second Stop", sequence_no: 2, scheduled_time: "08:10:00" },
    { id: "s1", name: "First Stop", sequence_no: 1, scheduled_time: "08:00:00" }
  ];

  it("sorts stops by sequence_no regardless of input order", () => {
    const { stops: result } = buildRouteManifest(stops, []);
    expect(result.map((s) => s.stopId)).toEqual(["s1", "s2"]);
  });

  it("groups students into their assigned stop", () => {
    const students: ManifestStudentRow[] = [
      { id: "st1", first_name: "Jane", last_name: "Doe", grade: "5", default_stop_id: "s1" },
      { id: "st2", first_name: "Bob", last_name: "Smith", grade: "3", default_stop_id: "s2" },
      { id: "st3", first_name: "Alice", last_name: "Jones", grade: "5", default_stop_id: "s1" }
    ];
    const { stops: result, unassignedStudents } = buildRouteManifest(stops, students);
    const first = result.find((s) => s.stopId === "s1")!;
    expect(first.students.map((s) => s.firstName)).toEqual(["Jane", "Alice"]);
    const second = result.find((s) => s.stopId === "s2")!;
    expect(second.students.map((s) => s.firstName)).toEqual(["Bob"]);
    expect(unassignedStudents).toEqual([]);
  });

  it("buckets a student with no default_stop_id into unassignedStudents", () => {
    const students: ManifestStudentRow[] = [{ id: "st1", first_name: "Jane", last_name: "Doe", grade: null, default_stop_id: null }];
    const { unassignedStudents } = buildRouteManifest(stops, students);
    expect(unassignedStudents).toEqual([{ id: "st1", firstName: "Jane", lastName: "Doe", grade: null }]);
  });

  it("buckets a student whose default_stop_id doesn't match any stop on this route", () => {
    const students: ManifestStudentRow[] = [
      { id: "st1", first_name: "Jane", last_name: "Doe", grade: null, default_stop_id: "some-other-route-stop" }
    ];
    const { stops: result, unassignedStudents } = buildRouteManifest(stops, students);
    expect(unassignedStudents).toHaveLength(1);
    expect(result.every((s) => s.students.length === 0)).toBe(true);
  });

  it("handles an empty route", () => {
    expect(buildRouteManifest([], [])).toEqual({ stops: [], unassignedStudents: [] });
  });
});
