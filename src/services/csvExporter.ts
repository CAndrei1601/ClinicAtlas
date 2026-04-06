import type { DoctorRecord, FilterState } from "@/types";
import { saveAs } from "file-saver";

function escapeCSV(val: string): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCSV).join(","),
    ...rows.map((r) => r.map(escapeCSV).join(",")),
  ];
  return lines.join("\n");
}

const GOOGLE_MY_MAPS_HEADERS = [
  "doctor_name",
  "full_address",
  "clinic",
  "specialty",
  "schedule",
  "phone",
  "city",
  "county",
  "latitude",
  "longitude",
];

function recordToRow(record: DoctorRecord): string[] {
  return [
    record.doctorName,
    record.fullAddress,
    record.clinic,
    record.specialty,
    record.schedule,
    record.phone,
    record.city,
    record.county,
    record.latitude != null ? String(record.latitude) : "",
    record.longitude != null ? String(record.longitude) : "",
  ];
}

export function exportCleanedCSV(records: DoctorRecord[], filters?: FilterState): void {
  const toExport = filters
    ? applyFilters(records, filters)
    : records.filter((r) => r.geocodingStatus === "geocoded");

  const csv = toCSV(GOOGLE_MY_MAPS_HEADERS, toExport.map(recordToRow));
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, "cleaned_doctors.csv");
}

export function exportUnresolvedCSV(records: DoctorRecord[]): void {
  const unresolved = records.filter((r) => r.geocodingStatus === "failed");
  const csv = toCSV(GOOGLE_MY_MAPS_HEADERS, unresolved.map(recordToRow));
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, "unresolved_addresses.csv");
}

export function exportAllCSV(records: DoctorRecord[]): void {
  const csv = toCSV(GOOGLE_MY_MAPS_HEADERS, records.map(recordToRow));
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, "all_doctors.csv");
}

function applyFilters(records: DoctorRecord[], filters: FilterState): DoctorRecord[] {
  return records.filter((r) => {
    const q = filters.search.toLowerCase();
    if (q && !r.doctorName.toLowerCase().includes(q) && !r.clinic.toLowerCase().includes(q)) return false;
    if (filters.city && r.city.toLowerCase() !== filters.city.toLowerCase()) return false;
    if (filters.county && r.county.toLowerCase() !== filters.county.toLowerCase()) return false;
    if (filters.specialty && r.specialty.toLowerCase() !== filters.specialty.toLowerCase()) return false;
    if (filters.geocodingStatus === "geocoded" && r.geocodingStatus !== "geocoded") return false;
    if (filters.geocodingStatus === "failed" && r.geocodingStatus !== "failed") return false;
    return true;
  });
}
