import type { RawRow, ColumnMapping, DoctorRecord } from "@/types";
import { v4 as uuidv4 } from "uuid";

// Romanian/European address abbreviation normalization map
const ADDRESS_REPLACEMENTS: [RegExp, string][] = [
  [/\bSTR\b\.?/gi,  "Strada"],
  [/\bBLD\b\.?/gi,  "Bulevardul"],   // e.g. "BLD 21 DECEMBRIE" (this file)
  [/\bBLVD\b\.?/gi, "Bulevardul"],
  [/\bBD\b\.?/gi,   "Bulevardul"],
  [/\bCALE\b/gi,    "Calea"],
  [/\bAL\b\.?/gi,   "Aleea"],
  [/\bPIATA\b\.?/gi,"Piata"],
  [/\bSOS\b\.?/gi,  "Soseaua"],
  [/\bNR\b\.?/gi,   "Nr."],
  [/\bAP\b\.?/gi,   "Ap."],
  [/\bBL\b\.?/gi,   "Bloc"],
  [/\bSC\b\.?/gi,   "Scara"],
  [/\bET\b\.?/gi,   "Etaj"],
  [/\bJUD\b\.?/gi,  "Judet"],
  [/\bMUN\b\.?/gi,  "Municipiul"],
  [/\bCOM\b\.?/gi,  "Comuna"],
  [/\bSAT\b\.?/gi,  "Satul"],
];

function trim(val: unknown): string {
  return String(val ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ");
}

/**
 * Title-case a string so "CLUJ NAPOCA" → "Cluj Napoca" and
 * "CLUJ-NAPOCA" → "Cluj-Napoca".
 * Uses (^|[\s-]) instead of \b so Romanian diacritics (ș, ț, ă, î, â) are
 * handled correctly — \b treats them as word boundaries and would mis-capitalize
 * the letter that follows (e.g. "BucureșTi" instead of "București").
 */
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function normalizeAddress(raw: string): string {
  let result = trim(raw);
  for (const [pattern, replacement] of ADDRESS_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function buildFullAddress(
  address: string,
  city: string,
  county: string,
  country: string
): string {
  const parts = [address, city, county, country].filter(
    (p) => p && p.trim() !== ""
  );
  return parts.join(", ");
}

function hasIncompleteAddress(city: string, address: string): boolean {
  return !city.trim() && !address.trim();
}

function makeKey(record: DoctorRecord): string {
  return `${record.doctorName}|${record.fullAddress}`.toLowerCase().trim();
}

export function cleanAndNormalize(
  rows: RawRow[],
  mapping: ColumnMapping,
  defaultCountry = "Romania"
): DoctorRecord[] {
  const seenKeys = new Map<string, number>();
  const records: DoctorRecord[] = [];

  rows.forEach((row, idx) => {
    const get = (key: keyof ColumnMapping): string => {
      const col = mapping[key];
      return col ? trim(row[col]) : "";
    };

    const address = normalizeAddress(get("address"));
    const city    = toTitleCase(trim(get("city")));
    const county  = toTitleCase(trim(get("county")));
    const country = toTitleCase(trim(get("country"))) || defaultCountry;
    const fullAddress = buildFullAddress(address, city, county, country);

    const record: DoctorRecord = {
      id: uuidv4(),
      doctorName: trim(get("doctorName")),
      address,
      city,
      county,
      schedule: trim(get("schedule")),
      phone: trim(get("phone")),
      clinic: trim(get("clinic")),
      specialty: trim(get("specialty")),
      country,
      fullAddress,
      latitude: null,
      longitude: null,
      geocodingStatus: "pending",
      hasIncompleteAddress: hasIncompleteAddress(city, address),
      isDuplicate: false,
      rowIndex: idx + 2, // 1-based with header
    };

    const key = makeKey(record);
    if (seenKeys.has(key)) {
      record.isDuplicate = true;
    } else {
      seenKeys.set(key, idx);
    }

    records.push(record);
  });

  return records;
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase());

  const findCol = (...keywords: string[]): string | null => {
    for (const kw of keywords) {
      const idx = lower.findIndex((h) => h.includes(kw));
      if (idx !== -1) return headers[idx];
    }
    return null;
  };

  return {
    doctorName: findCol("doctor", "medic", "name", "nume", "physician"),
    address: findCol("address", "adresa", "strada", "str", "stradă"),
    city: findCol("city", "oras", "oraș", "localit", "municipiu", "town"),
    county: findCol("county", "judet", "județ", "region", "regiune"),
    schedule: findCol("schedule", "program", "orar", "hours", "ore"),
    phone: findCol("phone", "telefon", "tel", "mobile", "mobil"),
    clinic: findCol("clinic", "clinica", "clinică", "cabinet", "unit", "spital", "hospital"),
    specialty: findCol("specialty", "specialit", "spec", "domain", "domeniu"),
    country: findCol("country", "tara", "țara", "țară"),
  };
}
