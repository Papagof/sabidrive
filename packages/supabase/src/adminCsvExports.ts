/**
 * Flat per-row CSV exports for the admin Alerts and SMS log pages -- unlike
 * reports.ts's buildReportsCsv (a grouped rollup summary), these are one
 * row per raw record, matching exactly what's already on screen. Pure, no
 * Supabase client, same file-per-concern pattern as tripHistory.ts /
 * routeManifest.ts.
 */

import { csvRow } from "./csv";

export interface AlertExportRow {
  type: string;
  severity: string;
  created_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
  notes: string | null;
}

/** assigned_to exports as Yes/blank, not the raw uuid -- the Alerts page itself never resolves it to a name either, only an "assigned" badge. */
export function buildAlertsCsv(alerts: AlertExportRow[]): string {
  const lines: string[] = [csvRow("Type", "Severity", "Created At", "Resolved At", "Assigned", "Notes")];
  for (const a of alerts) {
    lines.push(csvRow(a.type, a.severity, a.created_at, a.resolved_at ?? "", a.assigned_to ? "Yes" : "", a.notes ?? ""));
  }
  return lines.join("\n");
}

export interface SmsExportRow {
  recipient_phone: string;
  body: string;
  status: string;
  created_at: string;
}

export function buildSmsCsv(rows: SmsExportRow[]): string {
  const lines: string[] = [csvRow("Recipient Phone", "Body", "Status", "Created At")];
  for (const r of rows) {
    lines.push(csvRow(r.recipient_phone, r.body, r.status, r.created_at));
  }
  return lines.join("\n");
}

export interface StudentExportRow {
  first_name: string;
  last_name: string;
  grade: string | null;
  route_name: string | null;
  stop_name: string | null;
  /** Already-joined guardian names, e.g. "Jane Doe; John Doe". */
  guardians: string;
}

export function buildStudentsCsv(rows: StudentExportRow[]): string {
  const lines: string[] = [csvRow("First Name", "Last Name", "Grade", "Route", "Stop", "Guardians")];
  for (const r of rows) {
    lines.push(csvRow(r.first_name, r.last_name, r.grade ?? "", r.route_name ?? "", r.stop_name ?? "", r.guardians));
  }
  return lines.join("\n");
}
