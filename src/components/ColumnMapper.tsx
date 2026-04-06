"use client";

import { useState } from "react";
import type { ColumnMapping } from "@/types";
import { COLUMN_LABELS } from "@/types";
import type { SheetInfo } from "@/services/fileParser";
import { CheckCircle2, AlertCircle, TableProperties } from "lucide-react";
import clsx from "clsx";

interface Props {
  headers: string[];
  initialMapping: ColumnMapping;
  onConfirm: (mapping: ColumnMapping) => void;
  // Sheet picker (only relevant for multi-sheet Excel files)
  sheets?: SheetInfo[];
  activeSheet?: string;
  onSheetChange?: (sheetName: string) => void;
  isReparsingSheet?: boolean;
}

export default function ColumnMapper({
  headers,
  initialMapping,
  onConfirm,
  sheets = [],
  activeSheet = "",
  onSheetChange,
  isReparsingSheet = false,
}: Props) {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);

  // Keep local mapping in sync when parent re-parses a different sheet
  // (initialMapping changes when the sheet changes)
  const [prevInitial, setPrevInitial] = useState(initialMapping);
  if (initialMapping !== prevInitial) {
    setPrevInitial(initialMapping);
    setMapping(initialMapping);
  }

  const requiredFields: (keyof ColumnMapping)[] = ["doctorName", "city"];
  const isValid = requiredFields.every((f) => mapping[f] !== null);
  const hasMultipleSheets = sheets.length > 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

      {/* ── Sheet picker (only shown for multi-sheet workbooks) ── */}
      {hasMultipleSheets && onSheetChange && (
        <div className="px-5 py-3 border-b border-slate-100 bg-amber-50 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-700 font-medium text-sm">
            <TableProperties className="w-4 h-4" />
            This workbook has {sheets.length} sheets — select the one with your doctor data:
          </div>
          <div className="flex flex-wrap gap-2">
            {sheets.map((s) => (
              <button
                key={s.name}
                onClick={() => onSheetChange(s.name)}
                disabled={isReparsingSheet}
                className={clsx(
                  "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                  s.name === activeSheet
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:text-blue-600"
                )}
              >
                {s.name}
                <span className={clsx(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                  s.name === activeSheet ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {s.rowCount} rows
                </span>
              </button>
            ))}
          </div>
          {isReparsingSheet && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
              Loading sheet…
            </span>
          )}
        </div>
      )}

      {/* ── Column mapping header ── */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
        <h3 className="font-semibold text-slate-800">Column Mapping</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Match your file&apos;s columns to the expected fields. Fields marked{" "}
          <span className="text-red-500">*</span> are required.
          {activeSheet && (
            <span className="ml-1 text-slate-400">
              Reading from sheet: <strong className="text-slate-600">{activeSheet}</strong>
            </span>
          )}
        </p>
      </div>

      {/* ── Field selectors ── */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(COLUMN_LABELS) as (keyof ColumnMapping)[]).map((field) => {
          const isRequired = requiredFields.includes(field);
          const value = mapping[field];
          return (
            <div key={field}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {COLUMN_LABELS[field]}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                value={value ?? ""}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [field]: e.target.value || null,
                  }))
                }
                className={clsx(
                  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors",
                  isRequired && !value
                    ? "border-red-300 focus:ring-red-200"
                    : "border-slate-300 focus:ring-blue-200"
                )}
              >
                <option value="">&mdash; not mapped &mdash;</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {isValid ? (
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-4 h-4" /> Required fields mapped
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertCircle className="w-4 h-4" /> Map all required fields to continue
            </span>
          )}
        </div>
        <button
          disabled={!isValid || isReparsingSheet}
          onClick={() => onConfirm(mapping)}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          Confirm &amp; Continue
        </button>
      </div>
    </div>
  );
}
