import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { RawRow } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SheetInfo {
  name: string;
  rowCount: number; // data rows (excluding header)
}

export interface ParseResult {
  headers: string[];
  rows: RawRow[];
  fileName: string;
  totalRows: number;
  sheets: SheetInfo[];   // all sheets in the workbook (empty array for CSV)
  activeSheet: string;   // which sheet was actually parsed
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a .xlsx / .xls / .ods / .csv file.
 *
 * @param file       - the File object to parse
 * @param sheetName  - for multi-sheet workbooks: which sheet to parse.
 *                     When omitted the sheet with the most data rows is used.
 */
export async function parseFile(file: File, sheetName?: string): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") return parseCsvFile(file);
  if (ext === "xlsx" || ext === "xls" || ext === "ods") return parseExcelFile(file, sheetName);

  throw new Error(
    `Unsupported file type: .${ext}. Please upload .xlsx, .xls, or .csv`
  );
}

// ─── Excel ────────────────────────────────────────────────────────────────────

async function parseExcelFile(file: File, requestedSheet?: string): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  // Build info for every sheet so the UI can show a picker
  const sheets: SheetInfo[] = workbook.SheetNames.map((name) => {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[name],
      { header: 1, defval: "", blankrows: false }
    );
    // subtract 1 for the header row; minimum 0
    return { name, rowCount: Math.max(0, raw.length - 1) };
  });

  // Choose which sheet to actually parse:
  //   1. use the caller-supplied name if valid
  //   2. otherwise pick the sheet with the most data rows
  const activeSheet =
    (requestedSheet && workbook.SheetNames.includes(requestedSheet))
      ? requestedSheet
      : sheets.reduce((best, s) => (s.rowCount > best.rowCount ? s : best), sheets[0]).name;

  const sheet = workbook.Sheets[activeSheet];

  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (jsonData.length === 0) {
    throw new Error(`Sheet "${activeSheet}" appears to be empty.`);
  }

  const headers = normalizeHeaders(jsonData[0].map((h) => String(h ?? "")));

  const rows: RawRow[] = jsonData.slice(1).map((row) => {
    const record: RawRow = {};
    headers.forEach((h, i) => {
      record[h] = (row as unknown[])[i] != null ? String((row as unknown[])[i]) : "";
    });
    return record;
  });

  const nonEmptyRows = rows.filter((r) =>
    Object.values(r).some((v) => String(v).trim() !== "")
  );

  return {
    headers,
    rows: nonEmptyRows,
    fileName: file.name,
    totalRows: nonEmptyRows.length,
    sheets,
    activeSheet,
  };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/\s+/g, " "),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const rows = results.data as RawRow[];
        resolve({
          headers,
          rows,
          fileName: file.name,
          totalRows: rows.length,
          sheets: [],          // CSV has no sheets
          activeSheet: file.name,
        });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) =>
    String(h ?? "")
      .trim()
      .replace(/\s+/g, " ")
  );
}
