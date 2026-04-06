/**
 * dataCleaner.test.ts
 *
 * Tests for the address normalisation, full-address building, duplicate
 * detection, and auto column-mapping logic.
 */

import { cleanAndNormalize, autoDetectMapping } from "@/services/dataCleaner";
import type { ColumnMapping, RawRow } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FULL_MAPPING: ColumnMapping = {
  doctorName: "Medic",
  address: "Adresa",
  city: "Oras",
  county: "Judet",
  schedule: "Program",
  phone: "Telefon",
  clinic: "Clinica",
  specialty: "Specialitate",
  country: null,
};

function makeRow(overrides: Partial<RawRow> = {}): RawRow {
  return {
    Medic: "Dr. Test",
    Adresa: "Str. Victoriei Nr. 1",
    Oras: "București",
    Judet: "Sector 1",
    Program: "Lun-Vin 09:00-17:00",
    Telefon: "0721000000",
    Clinica: "Clinica Test",
    Specialitate: "Cardiologie",
    ...overrides,
  };
}

// ─── cleanAndNormalize ────────────────────────────────────────────────────────

describe("cleanAndNormalize — whitespace", () => {
  it("trims leading/trailing spaces from all fields", () => {
    const [r] = cleanAndNormalize([makeRow({ Medic: "  Dr. Test  ", Oras: "  Cluj  " })], FULL_MAPPING);
    expect(r.doctorName).toBe("Dr. Test");
    expect(r.city).toBe("Cluj"); // title-cased after trim
  });

  it("collapses multiple internal spaces into one", () => {
    const [r] = cleanAndNormalize([makeRow({ Medic: "Dr.  Maria   Ionescu" })], FULL_MAPPING);
    expect(r.doctorName).toBe("Dr. Maria Ionescu");
  });
});

describe("cleanAndNormalize — address abbreviation normalisation", () => {
  it("expands STR. to Strada", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "STR. Victoriei Nr. 1" })], FULL_MAPPING);
    expect(r.address).toContain("Strada");
    expect(r.address).not.toMatch(/\bSTR\b/i);
  });

  it("expands STR (no dot) to Strada", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "STR Victoriei Nr. 1" })], FULL_MAPPING);
    expect(r.address).toContain("Strada");
  });

  it("expands BD to Bulevardul", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "BD Unirii Nr. 45" })], FULL_MAPPING);
    expect(r.address).toContain("Bulevardul");
    expect(r.address).not.toMatch(/\bBD\b/);
  });

  it("expands SOS to Soseaua", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "SOS. Kiseleff 32" })], FULL_MAPPING);
    expect(r.address).toContain("Soseaua");
  });

  it("expands AL to Aleea", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "AL. Rozelor 5" })], FULL_MAPPING);
    expect(r.address).toContain("Aleea");
  });

  it("normalises NR to Nr.", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "Strada Victoriei NR 12" })], FULL_MAPPING);
    expect(r.address).toContain("Nr.");
    expect(r.address).not.toMatch(/\bNR\b(?!\.)/);
  });
});

describe("cleanAndNormalize — fullAddress", () => {
  it("builds full address from address + city + county + default country", () => {
    const [r] = cleanAndNormalize([makeRow()], FULL_MAPPING);
    expect(r.fullAddress).toContain("Victoriei");
    // "București" → toTitleCase → "București" (diacritics preserved, only first char uppercased)
    expect(r.fullAddress).toMatch(/Bucure[șs]ti/i);
    expect(r.fullAddress).toContain("Sector 1");
    expect(r.fullAddress).toContain("Romania");
  });

  it("uses custom country from the data when mapped", () => {
    const mapping = { ...FULL_MAPPING, country: "Tara" };
    const [r] = cleanAndNormalize([makeRow({ Tara: "Moldova" })], mapping);
    expect(r.country).toBe("Moldova");
    expect(r.fullAddress).toContain("Moldova");
    expect(r.fullAddress).not.toContain("Romania");
  });

  it("skips empty parts when building full address", () => {
    const [r] = cleanAndNormalize([makeRow({ Judet: "" })], FULL_MAPPING);
    expect(r.fullAddress).not.toMatch(/,\s*,/); // no double commas
    expect(r.fullAddress).toMatch(/Bucure[șs]ti/i);
  });
});

describe("cleanAndNormalize — incomplete address flag", () => {
  it("flags records where BOTH address AND city are empty", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "", Oras: "" })], FULL_MAPPING);
    expect(r.hasIncompleteAddress).toBe(true);
  });

  it("does not flag records that have a city even without a street address", () => {
    const [r] = cleanAndNormalize([makeRow({ Adresa: "" })], FULL_MAPPING);
    expect(r.hasIncompleteAddress).toBe(false);
  });

  it("does not flag records that have a street address even without a city", () => {
    const [r] = cleanAndNormalize([makeRow({ Oras: "" })], FULL_MAPPING);
    expect(r.hasIncompleteAddress).toBe(false);
  });
});

describe("cleanAndNormalize — duplicate detection", () => {
  it("marks the second occurrence of identical name+address as duplicate", () => {
    const row = makeRow();
    const [first, second] = cleanAndNormalize([row, row], FULL_MAPPING);
    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(true);
  });

  it("does not flag records with different names as duplicates", () => {
    const rows = [makeRow({ Medic: "Dr. A" }), makeRow({ Medic: "Dr. B" })];
    const [a, b] = cleanAndNormalize(rows, FULL_MAPPING);
    expect(a.isDuplicate).toBe(false);
    expect(b.isDuplicate).toBe(false);
  });

  it("duplicate detection is case-insensitive", () => {
    const rows = [makeRow({ Medic: "Dr. Test" }), makeRow({ Medic: "dr. test" })];
    const [, second] = cleanAndNormalize(rows, FULL_MAPPING);
    expect(second.isDuplicate).toBe(true);
  });
});

describe("cleanAndNormalize — record defaults", () => {
  it("assigns a unique uuid to each record", () => {
    const rows = [makeRow(), makeRow({ Medic: "Dr. Other" })];
    const [a, b] = cleanAndNormalize(rows, FULL_MAPPING);
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("sets geocodingStatus to 'pending' for every record", () => {
    const [r] = cleanAndNormalize([makeRow()], FULL_MAPPING);
    expect(r.geocodingStatus).toBe("pending");
  });

  it("sets latitude and longitude to null initially", () => {
    const [r] = cleanAndNormalize([makeRow()], FULL_MAPPING);
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
  });

  it("returns empty strings for unmapped optional fields", () => {
    const partial: ColumnMapping = { ...FULL_MAPPING, phone: null, schedule: null, clinic: null };
    const [r] = cleanAndNormalize([makeRow()], partial);
    expect(r.phone).toBe("");
    expect(r.schedule).toBe("");
    expect(r.clinic).toBe("");
  });

  it("records the 1-based row index (header = row 1, first data = row 2)", () => {
    const rows = [makeRow(), makeRow({ Medic: "Dr. B" })];
    const [a, b] = cleanAndNormalize(rows, FULL_MAPPING);
    expect(a.rowIndex).toBe(2);
    expect(b.rowIndex).toBe(3);
  });
});

// ─── autoDetectMapping ────────────────────────────────────────────────────────

describe("autoDetectMapping", () => {
  it("detects common Romanian header names", () => {
    const m = autoDetectMapping(["Medic", "Adresa", "Oras", "Judet", "Program", "Telefon", "Clinica", "Specialitate"]);
    expect(m.doctorName).toBe("Medic");
    expect(m.address).toBe("Adresa");
    expect(m.city).toBe("Oras");
    expect(m.county).toBe("Judet");
    expect(m.schedule).toBe("Program");
    expect(m.phone).toBe("Telefon");
    expect(m.clinic).toBe("Clinica");
    expect(m.specialty).toBe("Specialitate");
  });

  it("detects common English header names", () => {
    const m = autoDetectMapping(["Doctor Name", "Address", "City", "County", "Schedule", "Phone", "Clinic", "Specialty"]);
    expect(m.doctorName).toBe("Doctor Name");
    expect(m.address).toBe("Address");
    expect(m.city).toBe("City");
    expect(m.county).toBe("County");
    expect(m.phone).toBe("Phone");
    expect(m.specialty).toBe("Specialty");
  });

  it("returns null for columns it cannot recognise", () => {
    const m = autoDetectMapping(["Column1", "Column2", "RandomHeader"]);
    expect(m.doctorName).toBeNull();
    expect(m.city).toBeNull();
    expect(m.phone).toBeNull();
  });

  it("is case-insensitive during detection", () => {
    const m = autoDetectMapping(["DOCTOR", "PHONE", "CITY"]);
    expect(m.doctorName).toBe("DOCTOR");
    expect(m.phone).toBe("PHONE");
    expect(m.city).toBe("CITY");
  });
});
