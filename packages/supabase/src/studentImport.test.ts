import { describe, expect, it } from "vitest";
import { buildStudentImportPlan, parseCsv } from "./studentImport";

describe("parseCsv", () => {
  it("parses a simple CSV", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"]
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    expect(parseCsv('name,note\nJane,"Smith, Jr."')).toEqual([
      ["name", "note"],
      ["Jane", "Smith, Jr."]
    ]);
  });

  it("handles an escaped double-quote inside a quoted field", () => {
    expect(parseCsv('name\n"Say ""hi"""')).toEqual([["name"], ['Say "hi"']]);
  });

  it("handles a quoted field containing a newline", () => {
    expect(parseCsv('name,note\nJane,"line one\nline two"')).toEqual([
      ["name", "note"],
      ["Jane", "line one\nline two"]
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });

  it("drops trailing blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });

  it("handles a file with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("buildStudentImportPlan", () => {
  const routes = [
    { id: "r1", name: "Route A" },
    { id: "r2", name: "Route B" },
    { id: "r-dup1", name: "Duplicate Route" },
    { id: "r-dup2", name: "Duplicate Route" }
  ];
  const stops = [
    { id: "s1", name: "Elm St", route_id: "r1" },
    { id: "s2", name: "Oak Ave", route_id: "r1" },
    { id: "s-other", name: "Elm St", route_id: "r2" }
  ];

  it("accepts a fully valid CSV, resolving route and stop names case-insensitively", () => {
    const csv = parseCsv("first_name,last_name,grade,route,stop\nJane,Doe,5,route a,elm st");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.errors).toEqual([]);
    expect(plan.valid).toEqual([
      { first_name: "Jane", last_name: "Doe", grade: "5", default_route_id: "r1", default_stop_id: "s1" }
    ]);
  });

  it("accepts a row with no route/stop at all", () => {
    const csv = parseCsv("first_name,last_name\nJane,Doe");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.errors).toEqual([]);
    expect(plan.valid).toEqual([
      { first_name: "Jane", last_name: "Doe", grade: undefined, default_route_id: null, default_stop_id: null }
    ]);
  });

  it("errors on a missing required field", () => {
    const csv = parseCsv("first_name,last_name\nJane,");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.valid).toEqual([]);
    expect(plan.errors).toEqual([{ row: 2, message: "Missing first_name or last_name" }]);
  });

  it("errors on an unknown route", () => {
    const csv = parseCsv("first_name,last_name,route\nJane,Doe,Route Z");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.valid).toEqual([]);
    expect(plan.errors).toEqual([{ row: 2, message: 'Route "Route Z" not found' }]);
  });

  it("errors on an ambiguous (duplicate) route name", () => {
    const csv = parseCsv("first_name,last_name,route\nJane,Doe,Duplicate Route");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.valid).toEqual([]);
    expect(plan.errors).toEqual([{ row: 2, message: 'Route "Duplicate Route" is ambiguous (matches 2 routes)' }]);
  });

  it("errors when a stop is given without a route", () => {
    const csv = parseCsv("first_name,last_name,stop\nJane,Doe,Elm St");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.valid).toEqual([]);
    expect(plan.errors).toEqual([{ row: 2, message: 'Stop "Elm St" given without a route' }]);
  });

  it("errors on a stop name that doesn't belong to the resolved route", () => {
    const csv = parseCsv("first_name,last_name,route,stop\nJane,Doe,Route B,Oak Ave");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.valid).toEqual([]);
    expect(plan.errors).toEqual([{ row: 2, message: 'Stop "Oak Ave" not found on route "Route B"' }]);
  });

  it("errors when the header is missing required columns", () => {
    const csv = parseCsv("name\nJane");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.valid).toEqual([]);
    expect(plan.errors).toEqual([{ row: 0, message: "CSV header must include first_name and last_name columns" }]);
  });

  it("handles an empty CSV", () => {
    expect(buildStudentImportPlan([], routes, stops)).toEqual({ valid: [], errors: [{ row: 0, message: "CSV is empty" }] });
  });

  it("continues past error rows to still validate later valid rows", () => {
    const csv = parseCsv("first_name,last_name\nJane,\nBob,Smith");
    const plan = buildStudentImportPlan(csv, routes, stops);
    expect(plan.errors).toEqual([{ row: 2, message: "Missing first_name or last_name" }]);
    expect(plan.valid).toEqual([
      { first_name: "Bob", last_name: "Smith", grade: undefined, default_route_id: null, default_stop_id: null }
    ]);
  });
});
