/**
 * usePersistedSession
 *
 * Persist the current doctor dataset (records + fileName) to localStorage so
 * that a page refresh restores the map without re-uploading or re-geocoding.
 *
 * Storage key:  "doctor-mapper-session"
 * Stored shape: { version, fileName, records }
 *
 * `version` lets us invalidate stale shapes if we ever change DoctorRecord.
 */

import type { DoctorRecord } from "@/types";

const STORAGE_KEY = "doctor-mapper-session";
const SCHEMA_VERSION = 1;

interface PersistedSession {
  version: number;
  fileName: string;
  records: DoctorRecord[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function loadSession(): { fileName: string; records: DoctorRecord[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed.version !== SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!Array.isArray(parsed.records) || parsed.records.length === 0) return null;
    return { fileName: parsed.fileName ?? "", records: parsed.records };
  } catch {
    return null;
  }
}

export function saveSession(records: DoctorRecord[], fileName: string): void {
  if (typeof window === "undefined") return;
  try {
    const session: PersistedSession = { version: SCHEMA_VERSION, fileName, records };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // QuotaExceededError or private-browsing restriction — fail silently
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
