/**
 * Pure CSV parsing + row validation for Admin -> Students' bulk import.
 * No Supabase client, no DOM/File APIs -- fully unit-testable in isolation,
 * same pure-function-file pattern as reports.ts / packages/gps-sim's
 * engine.ts.
 */

/** Hand-rolled CSV parser -- no dependency in this repo does this, and a
 * naive .split(",") breaks on any quoted field (commas/quotes/newlines
 * inside a value), common enough in real school data to get wrong silently.
 * Handles doubled-"" quote escaping and both CRLF and LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop blank lines (a row that parsed to a single empty field).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface StudentImportRow {
  first_name: string;
  last_name: string;
  grade?: string;
  default_route_id?: string | null;
  default_stop_id?: string | null;
}

export interface StudentImportError {
  row: number;
  message: string;
}

export interface StudentImportPlan {
  valid: StudentImportRow[];
  errors: StudentImportError[];
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_]+/g, "_");
}

/** Resolves a CSV's route/stop *names* against the school's already-loaded route/stop lists. */
export function buildStudentImportPlan(
  csvRows: string[][],
  routes: { id: string; name: string }[],
  stops: { id: string; name: string; route_id: string }[]
): StudentImportPlan {
  const errors: StudentImportError[] = [];
  const valid: StudentImportRow[] = [];

  if (csvRows.length === 0) {
    return { valid, errors: [{ row: 0, message: "CSV is empty" }] };
  }

  const header = csvRows[0]!.map(normalizeHeader);
  const firstNameIdx = header.indexOf("first_name");
  const lastNameIdx = header.indexOf("last_name");
  const gradeIdx = header.indexOf("grade");
  const routeIdx = header.indexOf("route");
  const stopIdx = header.indexOf("stop");

  if (firstNameIdx === -1 || lastNameIdx === -1) {
    return { valid, errors: [{ row: 0, message: "CSV header must include first_name and last_name columns" }] };
  }

  for (let i = 1; i < csvRows.length; i++) {
    const cells = csvRows[i]!;
    const rowNumber = i + 1; // 1-indexed, header counted as row 1

    const firstName = (cells[firstNameIdx] ?? "").trim();
    const lastName = (cells[lastNameIdx] ?? "").trim();
    if (!firstName || !lastName) {
      errors.push({ row: rowNumber, message: "Missing first_name or last_name" });
      continue;
    }

    const grade = gradeIdx !== -1 ? (cells[gradeIdx] ?? "").trim() : "";
    const routeName = routeIdx !== -1 ? (cells[routeIdx] ?? "").trim() : "";
    const stopName = stopIdx !== -1 ? (cells[stopIdx] ?? "").trim() : "";

    let routeId: string | null = null;
    if (routeName) {
      const matches = routes.filter((r) => r.name.toLowerCase() === routeName.toLowerCase());
      if (matches.length === 0) {
        errors.push({ row: rowNumber, message: `Route "${routeName}" not found` });
        continue;
      }
      if (matches.length > 1) {
        errors.push({ row: rowNumber, message: `Route "${routeName}" is ambiguous (matches ${matches.length} routes)` });
        continue;
      }
      routeId = matches[0]!.id;
    }

    let stopId: string | null = null;
    if (stopName) {
      if (!routeId) {
        errors.push({ row: rowNumber, message: `Stop "${stopName}" given without a route` });
        continue;
      }
      const stopMatches = stops.filter((s) => s.route_id === routeId && s.name.toLowerCase() === stopName.toLowerCase());
      if (stopMatches.length === 0) {
        errors.push({ row: rowNumber, message: `Stop "${stopName}" not found on route "${routeName}"` });
        continue;
      }
      if (stopMatches.length > 1) {
        errors.push({ row: rowNumber, message: `Stop "${stopName}" is ambiguous (matches ${stopMatches.length} stops)` });
        continue;
      }
      stopId = stopMatches[0]!.id;
    }

    valid.push({
      first_name: firstName,
      last_name: lastName,
      grade: grade || undefined,
      default_route_id: routeId,
      default_stop_id: stopId
    });
  }

  return { valid, errors };
}
