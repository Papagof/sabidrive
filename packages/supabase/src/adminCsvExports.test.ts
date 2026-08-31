import { describe, expect, it } from "vitest";
import { buildAlertsCsv, buildSmsCsv, buildStudentsCsv } from "./adminCsvExports";
import type { AlertExportRow, SmsExportRow, StudentExportRow } from "./adminCsvExports";

describe("buildAlertsCsv", () => {
  it("includes a header and one row per alert", () => {
    const alerts: AlertExportRow[] = [
      {
        type: "speeding",
        severity: "warning",
        created_at: "2026-01-01T08:00:00Z",
        resolved_at: null,
        assigned_to: null,
        notes: null
      }
    ];
    const csv = buildAlertsCsv(alerts);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Type,Severity,Created At,Resolved At,Assigned,Notes");
    expect(lines[1]).toBe("speeding,warning,2026-01-01T08:00:00Z,,,");
  });

  it("exports assigned_to as Yes rather than the raw id", () => {
    const alerts: AlertExportRow[] = [
      { type: "sos", severity: "critical", created_at: "2026-01-01T08:00:00Z", resolved_at: null, assigned_to: "admin-uuid", notes: null }
    ];
    expect(buildAlertsCsv(alerts)).toContain("Yes");
    expect(buildAlertsCsv(alerts)).not.toContain("admin-uuid");
  });

  it("escapes a comma in notes", () => {
    const alerts: AlertExportRow[] = [
      {
        type: "route_deviation",
        severity: "info",
        created_at: "2026-01-01T08:00:00Z",
        resolved_at: "2026-01-01T08:05:00Z",
        assigned_to: null,
        notes: "Called driver, confirmed detour"
      }
    ];
    expect(buildAlertsCsv(alerts)).toContain('"Called driver, confirmed detour"');
  });

  it("handles an empty list", () => {
    expect(buildAlertsCsv([])).toBe("Type,Severity,Created At,Resolved At,Assigned,Notes");
  });
});

describe("buildSmsCsv", () => {
  it("includes a header and one row per SMS", () => {
    const rows: SmsExportRow[] = [
      { recipient_phone: "+15551234567", body: "Your child boarded the bus", status: "simulated_sent", created_at: "2026-01-01T08:00:00Z" }
    ];
    const csv = buildSmsCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Recipient Phone,Body,Status,Created At");
    expect(lines[1]).toBe("+15551234567,Your child boarded the bus,simulated_sent,2026-01-01T08:00:00Z");
  });

  it("escapes a comma in the body", () => {
    const rows: SmsExportRow[] = [
      { recipient_phone: "+15551234567", body: "Boarded at Elm St, 8:02am", status: "simulated_sent", created_at: "2026-01-01T08:00:00Z" }
    ];
    expect(buildSmsCsv(rows)).toContain('"Boarded at Elm St, 8:02am"');
  });

  it("handles an empty list", () => {
    expect(buildSmsCsv([])).toBe("Recipient Phone,Body,Status,Created At");
  });
});

describe("buildStudentsCsv", () => {
  it("includes a header and one row per student", () => {
    const rows: StudentExportRow[] = [
      { first_name: "Jane", last_name: "Doe", grade: "5", route_name: "Route A", stop_name: "Elm St", guardians: "Priya Parent" }
    ];
    const csv = buildStudentsCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("First Name,Last Name,Grade,Route,Stop,Guardians");
    expect(lines[1]).toBe("Jane,Doe,5,Route A,Elm St,Priya Parent");
  });

  it("renders blank cells for missing grade/route/stop", () => {
    const rows: StudentExportRow[] = [
      { first_name: "Jane", last_name: "Doe", grade: null, route_name: null, stop_name: null, guardians: "" }
    ];
    expect(buildStudentsCsv(rows).split("\n")[1]).toBe("Jane,Doe,,,,");
  });

  it("escapes a comma in a route name", () => {
    const rows: StudentExportRow[] = [
      { first_name: "Jane", last_name: "Doe", grade: "5", route_name: "Route A, North Loop", stop_name: "Elm St", guardians: "Priya Parent" }
    ];
    expect(buildStudentsCsv(rows)).toContain('"Route A, North Loop"');
  });

  it("handles an empty list", () => {
    expect(buildStudentsCsv([])).toBe("First Name,Last Name,Grade,Route,Stop,Guardians");
  });
});
