"use client";

import React from "react";
import type { DoctorRecord } from "@/types";
import { MapPin, Phone, Clock, Stethoscope, Building2, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface Props {
  records: DoctorRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const statusColors: Record<string, string> = {
  geocoded: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
  skipped: "bg-slate-100 text-slate-500",
};

export default React.memo(function DoctorList({ records, selectedId, onSelect }: Props) {
  if (records.length === 0) {
    return (
      <div className="p-4 text-center text-slate-400 text-sm">
        No doctors match the current filters.
      </div>
    );
  }

  return (
    <ul>
      {records.map((r) => (
        <li
          key={r.id}
          onClick={() => onSelect(r.id)}
          className={clsx(
            "px-3 py-3 border-b border-slate-100 cursor-pointer transition-colors text-sm",
            selectedId === r.id
              ? "bg-blue-50 border-l-2 border-l-blue-500"
              : "hover:bg-slate-50"
          )}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-semibold text-slate-800 leading-tight">
              {r.doctorName || <span className="text-slate-400 italic">Unnamed</span>}
            </span>
            <span className={clsx("text-xs px-1.5 py-0.5 rounded-full flex-shrink-0", statusColors[r.geocodingStatus])}>
              {r.geocodingStatus}
            </span>
          </div>

          {r.specialty && (
            <div className="flex items-center gap-1 text-xs text-blue-600 mb-1">
              <Stethoscope className="w-3 h-3" /> {r.specialty}
            </div>
          )}

          {r.clinic && (
            <div className="flex items-center gap-1 text-xs text-slate-500 mb-0.5">
              <Building2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{r.clinic}</span>
            </div>
          )}

          <div className="flex items-start gap-1 text-xs text-slate-500 mb-0.5">
            <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{r.fullAddress || <span className="italic">No address</span>}</span>
          </div>

          <div className="flex gap-3 mt-1">
            {r.phone && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Phone className="w-3 h-3" /> {r.phone}
              </span>
            )}
            {r.schedule && (
              <span className="flex items-center gap-1 text-xs text-slate-400 truncate">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{r.schedule}</span>
              </span>
            )}
          </div>

          {r.hasIncompleteAddress && (
            <div className="flex items-center gap-1 text-xs text-amber-500 mt-1">
              <AlertCircle className="w-3 h-3" /> Incomplete address
            </div>
          )}
          {selectedId === r.id && r.geocodingStatus !== "geocoded" && (
            <div className="flex items-center gap-1 text-xs text-slate-400 mt-1 italic">
              <MapPin className="w-3 h-3" />
              {r.geocodingStatus === "failed"
                ? "Not on map — address could not be geocoded"
                : "Not on map — geocoding pending"}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
});
