import type { DoctorRecord, GeocodeResult, GeocodingProgress } from "@/types";

const BATCH_SIZE = 5;
const DELAY_MS = 1100; // Nominatim rate limit: 1 req/sec (only for live requests)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocodeRecord(
  record: DoctorRecord
): Promise<GeocodeResult | null> {
  if (!record.fullAddress.trim()) return null;

  try {
    const response = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: record.fullAddress,
        street: record.address,
        city: record.city,
        county: record.county,
        country: record.country,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.latitude || !data.longitude) return null;
    return data as GeocodeResult;
  } catch {
    return null;
  }
}

export async function geocodeAllRecords(
  records: DoctorRecord[],
  onProgress: (progress: GeocodingProgress) => void,
  onRecordUpdate: (id: string, result: GeocodeResult | null) => void,
  signal?: AbortSignal
): Promise<void> {
  const eligible = records.filter(
    (r) => !r.hasIncompleteAddress && !r.isDuplicate && r.geocodingStatus === "pending"
  );

  const progress: GeocodingProgress = {
    total: eligible.length,
    done: 0,
    failed: 0,
  };

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;

    const batch = eligible.slice(i, i + BATCH_SIZE);

    for (const record of batch) {
      if (signal?.aborted) break;

      const result = await geocodeRecord(record);
      onRecordUpdate(record.id, result);

      progress.done++;
      if (!result) progress.failed++;
      onProgress({ ...progress });

      // FIX: Only wait for the rate-limit when Nominatim was actually called.
      // Cached results return instantly — no delay needed. Without this fix,
      // 168 cached doctors × 1.1 s = ~3 minutes wasted on unnecessary sleeps.
      const isLastRecord = i + batch.indexOf(record) + 1 >= eligible.length;
      const wasCached = result?.cached === true;
      if (!isLastRecord && !wasCached) {
        await delay(DELAY_MS);
      }
    }
  }
}
