import Papa from "papaparse";

export interface CSVResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCSV(text: string): CSVResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data };
}

export function serializeCSV(
  headers: string[],
  rows: Record<string, string>[]
): string {
  return Papa.unparse({ fields: headers, data: rows });
}

export function ensureColumn(result: CSVResult, columnName: string): CSVResult {
  if (result.headers.includes(columnName)) return result;
  return {
    headers: [...result.headers, columnName],
    rows: result.rows.map((row) => ({ ...row, [columnName]: "" })),
  };
}

export function countPending(
  rows: Record<string, string>[],
  sentColumn: string
): number {
  return rows.filter((row) => !row[sentColumn]?.trim()).length;
}
