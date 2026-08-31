/**
 * Shared CSV-cell primitives -- extracted from reports.ts once a second and
 * third consumer (adminCsvExports.ts) needed the same escaping logic,
 * crossing this project's "three similar things" threshold for pulling
 * something into its own small module.
 */

/** Quotes a field if it contains a comma, quote, or newline; doubles up any internal quotes. */
export function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function csvRow(...cells: (string | number)[]): string {
  return cells.map(csvEscape).join(",");
}
