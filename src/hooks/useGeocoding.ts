import { useState, useCallback, useRef } from "react";
import type { DoctorRecord, GeocodingProgress, GeocodeResult } from "@/types";
import { geocodeAllRecords } from "@/services/geocoder";

// Apply state updates in batches of this size to reduce re-renders.
// With 168 doctors this means ~34 re-renders instead of 168.
const UPDATE_BATCH_SIZE = 5;

type PendingUpdate = { id: string; result: GeocodeResult | null };

export function useGeocoding(
  records: DoctorRecord[],
  setRecords: React.Dispatch<React.SetStateAction<DoctorRecord[]>>
) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [progress, setProgress] = useState<GeocodingProgress>({ total: 0, done: 0, failed: 0 });
  const abortRef = useRef<AbortController | null>(null);

  // Accumulate individual record updates here; flush to React state in batches.
  const pendingUpdatesRef = useRef<PendingUpdate[]>([]);

  const flushUpdates = useCallback(() => {
    const updates = pendingUpdatesRef.current.splice(0);
    if (updates.length === 0) return;

    setRecords((prev) => {
      // Build a lookup map for O(1) updates instead of O(n) per record
      const updateMap = new Map(updates.map(({ id, result }) => [id, result]));
      return prev.map((r) => {
        const result = updateMap.get(r.id);
        if (result === undefined) return r; // not in this batch
        return {
          ...r,
          latitude:         result?.latitude  ?? null,
          longitude:        result?.longitude ?? null,
          geocodingStatus:  result ? "geocoded" : "failed",
          geocodingError:   result ? undefined  : "Address not found",
        };
      });
    });
  }, [setRecords]);

  const handleRecordUpdate = useCallback(
    (id: string, result: GeocodeResult | null) => {
      pendingUpdatesRef.current.push({ id, result });

      // Flush every UPDATE_BATCH_SIZE records so the UI updates progressively
      // but doesn't re-render 168 times for a fully-cached dataset.
      if (pendingUpdatesRef.current.length >= UPDATE_BATCH_SIZE) {
        flushUpdates();
      }
    },
    [flushUpdates]
  );

  const startGeocoding = useCallback(async () => {
    if (isGeocoding) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setIsGeocoding(true);
    setProgress({ total: 0, done: 0, failed: 0 });
    pendingUpdatesRef.current = [];

    try {
      await geocodeAllRecords(
        records,
        setProgress,
        handleRecordUpdate,
        abort.signal
      );
    } finally {
      // Flush any remaining updates that didn't fill a full batch
      flushUpdates();
      setIsGeocoding(false);
    }
  }, [isGeocoding, records, handleRecordUpdate, flushUpdates]);

  const stopGeocoding = useCallback(() => {
    abortRef.current?.abort();
    flushUpdates(); // flush any pending updates before stopping
    setIsGeocoding(false);
  }, [flushUpdates]);

  return { isGeocoding, progress, startGeocoding, stopGeocoding };
}
