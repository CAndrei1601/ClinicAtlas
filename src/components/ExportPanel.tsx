"use client";

import { useState } from "react";
import type { DoctorRecord, FilterState } from "@/types";
import { exportCleanedCSV, exportUnresolvedCSV, exportAllCSV } from "@/services/csvExporter";
import { Download, FileDown, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";

interface Props {
  records: DoctorRecord[];
  filters: FilterState;
}

export default function ExportPanel({ records, filters }: Props) {
  const geocoded = records.filter((r) => r.geocodingStatus === "geocoded");
  const failed = records.filter((r) => r.geocodingStatus === "failed");
  const hasFilters =
    filters.search || filters.city || filters.county || filters.specialty ||
    filters.address || filters.geocodingStatus !== "all";

  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  async function handleClearCache() {
    setClearingCache(true);
    try {
      await fetch("/api/geocode", { method: "DELETE" });
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 4000);
    } finally {
      setClearingCache(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Export Data</h2>
        <p className="text-slate-500 text-sm">
          Download your cleaned and geocoded data in various formats.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200">
          <div className="text-2xl font-bold text-slate-900">{records.length}</div>
          <div className="text-xs text-slate-500 mt-1">Total records</div>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center border border-green-200">
          <div className="text-2xl font-bold text-green-700">{geocoded.length}</div>
          <div className="text-xs text-green-600 mt-1">Geocoded</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center border border-red-200">
          <div className="text-2xl font-bold text-red-700">{failed.length}</div>
          <div className="text-xs text-red-600 mt-1">Unresolved</div>
        </div>
      </div>

      {/* Export options */}
      <div className="space-y-3">
        <ExportCard
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          title="Geocoded doctors (Google My Maps ready)"
          description={`${geocoded.length} records with latitude/longitude — best for Google My Maps`}
          filename="cleaned_doctors.csv"
          badge="Recommended"
          badgeColor="green"
          onExport={() => exportCleanedCSV(records)}
          disabled={geocoded.length === 0}
        />

        {hasFilters && (
          <ExportCard
            icon={<FileDown className="w-5 h-5 text-blue-600" />}
            title="Filtered results"
            description="Export only the records currently shown after applying filters"
            filename="filtered_doctors.csv"
            badge="Filtered"
            badgeColor="blue"
            onExport={() => exportCleanedCSV(records, filters)}
            disabled={geocoded.length === 0}
          />
        )}

        <ExportCard
          icon={<Download className="w-5 h-5 text-slate-600" />}
          title="All doctors"
          description={`All ${records.length} records including unresolved (blank lat/lng for unresolved)`}
          filename="all_doctors.csv"
          onExport={() => exportAllCSV(records)}
          disabled={records.length === 0}
        />

        {failed.length > 0 && (
          <ExportCard
            icon={<AlertCircle className="w-5 h-5 text-amber-600" />}
            title="Unresolved addresses"
            description={`${failed.length} records that could not be geocoded — review and fix manually`}
            filename="unresolved_addresses.csv"
            badge="Needs review"
            badgeColor="amber"
            onExport={() => exportUnresolvedCSV(records)}
            disabled={failed.length === 0}
          />
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>Tip:</strong> The CSV files are UTF-8 encoded with BOM so they open correctly in Excel. For Google My Maps, use the &ldquo;Geocoded doctors&rdquo; file &mdash; it includes latitude/longitude for precise marker placement.
      </div>

      {/* Cache management */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Geocoding Cache</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Results are cached server-side to avoid re-geocoding the same address.
            If a marker appears in the wrong location, clear the cache and re-run geocoding.
          </p>
          {cacheCleared && (
            <p className="text-xs text-green-600 mt-1 font-medium">✓ Cache cleared — re-run geocoding to get fresh results</p>
          )}
        </div>
        <button
          onClick={handleClearCache}
          disabled={clearingCache}
          className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
          {clearingCache ? "Clearing…" : "Clear cache"}
        </button>
      </div>
    </div>
  );
}

interface ExportCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  filename: string;
  badge?: string;
  badgeColor?: "green" | "blue" | "amber";
  onExport: () => void;
  disabled?: boolean;
}

const badgeColors = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
};

function ExportCard({ icon, title, description, filename, badge, badgeColor = "green", onExport, disabled }: ExportCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">{title}</span>
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColors[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        <p className="text-xs text-slate-400 mt-0.5 font-mono">{filename}</p>
      </div>
      <button
        onClick={onExport}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
      >
        <Download className="w-4 h-4" />
        Export
      </button>
    </div>
  );
}
