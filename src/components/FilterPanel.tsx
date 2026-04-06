"use client";

import type { DoctorRecord, FilterState } from "@/types";
import { Search, X } from "lucide-react";

interface Props {
  records: DoctorRecord[];
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
}

function uniqueSorted(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort();
}

export default function FilterPanel({ records, filters, onFiltersChange }: Props) {
  const cities = uniqueSorted(records.map((r) => r.city));
  const counties = uniqueSorted(records.map((r) => r.county));
  const specialties = uniqueSorted(records.map((r) => r.specialty));

  // Compute unique fullAddresses with count, sorted by count desc
  const addressCounts = records.reduce<Record<string, number>>((acc, r) => {
    if (r.fullAddress) acc[r.fullAddress] = (acc[r.fullAddress] ?? 0) + 1;
    return acc;
  }, {});
  const addressOptions = Object.entries(addressCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([, count]) => count > 1); // only show addresses shared by 2+ doctors

  const hasActiveFilters =
    filters.search || filters.city || filters.county || filters.specialty ||
    filters.address || filters.geocodingStatus !== "all";

  const reset = () =>
    onFiltersChange({ search: "", city: "", county: "", specialty: "", address: "", geocodingStatus: "all" });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, clinic, specialty&hellip;"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <select
          value={filters.city}
          onChange={(e) => onFiltersChange({ ...filters, city: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filters.county}
          onChange={(e) => onFiltersChange({ ...filters, county: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All counties</option>
          {counties.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filters.specialty}
          onChange={(e) => onFiltersChange({ ...filters, specialty: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All specialties</option>
          {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        {addressOptions.length > 0 && (
          <select
            value={filters.address}
            onChange={(e) => onFiltersChange({ ...filters, address: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All locations</option>
            {addressOptions.map(([addr, count]) => (
              <option key={addr} value={addr}>
                {addr.length > 45 ? addr.slice(0, 45) + "…" : addr} ({count})
              </option>
            ))}
          </select>
        )}

        <select
          value={filters.geocodingStatus}
          onChange={(e) => onFiltersChange({ ...filters, geocodingStatus: e.target.value as FilterState["geocodingStatus"] })}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="all">All statuses</option>
          <option value="geocoded">Geocoded only</option>
          <option value="failed">Failed only</option>
        </select>
      </div>

      {hasActiveFilters && (
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          <X className="w-3 h-3" /> Clear all filters
        </button>
      )}
    </div>
  );
}
