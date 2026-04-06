export type ProcessingStep =
  | "idle"
  | "uploading"
  | "parsing"
  | "mapping"
  | "cleaning"
  | "geocoding"
  | "ready"
  | "error";

export type GeocodingStatus = "pending" | "geocoded" | "failed" | "skipped";

export interface RawRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ColumnMapping {
  doctorName: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  schedule: string | null;
  phone: string | null;
  clinic: string | null;
  specialty: string | null;
  country: string | null;
}

export const COLUMN_LABELS: Record<keyof ColumnMapping, string> = {
  doctorName: "Doctor Name",
  address: "Address",
  city: "City / Locality",
  county: "County / Region",
  schedule: "Schedule / Working Hours",
  phone: "Phone",
  clinic: "Clinic / Medical Unit",
  specialty: "Specialty",
  country: "Country",
};

export interface DoctorRecord {
  id: string;
  // Normalized fields
  doctorName: string;
  address: string;
  city: string;
  county: string;
  schedule: string;
  phone: string;
  clinic: string;
  specialty: string;
  country: string;
  // Computed
  fullAddress: string;
  // Geocoding
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: GeocodingStatus;
  geocodingError?: string;
  // Quality flags
  hasIncompleteAddress: boolean;
  isDuplicate: boolean;
  rowIndex: number;
}

export interface FilterState {
  search: string;
  city: string;
  county: string;
  specialty: string;
  address: string;          // filter by fullAddress (groups doctors at the same location)
  geocodingStatus: "all" | "geocoded" | "failed";
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  /** True when the result came from the server-side cache (no Nominatim HTTP call was made) */
  cached?: boolean;
}

export interface GeocodingProgress {
  total: number;
  done: number;
  failed: number;
}
