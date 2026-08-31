import { describe, expect, it } from "vitest";
import { buildAlertsCsv, buildSmsCsv } from "./adminCsvExports";
import type { AlertExportRow, SmsExportRow } from "./adminCsvExports";

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
