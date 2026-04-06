"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import type { RawRow, ColumnMapping, DoctorRecord, FilterState, ProcessingStep } from "@/types";
import { parseFile } from "@/services/fileParser";
import type { SheetInfo } from "@/services/fileParser";
import { cleanAndNormalize, autoDetectMapping } from "@/services/dataCleaner";
import { useGeocoding } from "@/hooks/useGeocoding";
import { loadSession, saveSession, clearSession } from "@/hooks/usePersistedSession";
import FileUpload from "@/components/FileUpload";
import ColumnMapper from "@/components/ColumnMapper";
import DataPreview from "@/components/DataPreview";
import DoctorList from "@/components/DoctorList";
import FilterPanel from "@/components/FilterPanel";
import ExportPanel from "@/components/ExportPanel";
import Instructions from "@/components/Instructions";
import ProgressIndicator from "@/components/ProgressIndicator";
import { MapPin, FileSpreadsheet, Map, Download, BookOpen, AlertCircle, CheckCircle2, Users, List } from "lucide-react";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const INITIAL_FILTERS: FilterState = {
  search: "",
  city: "",
  county: "",
  specialty: "",
  address: "",
  geocodingStatus: "all",
};

export default function Home() {
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Original file kept so we can re-parse when the user switches sheets
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Raw parse data
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [fileName, setFileName] = useState("");

  // Sheet info (for multi-sheet Excel files)
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [isReparsingSheet, setIsReparsingSheet] = useState(false);

  // Mapping
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);

  // Processed records
  const [records, setRecords] = useState<DoctorRecord[]>([]);

  // Map
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  // Geocoding
  const { isGeocoding, progress, startGeocoding, stopGeocoding } = useGeocoding(records, setRecords);

  // ── Session persistence ────────────────────────────────────────────────────
  // Restore previous session on first mount (client-side only).
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setRecords(saved.records);
      setFileName(saved.fileName);
      setStep("ready");
      setSessionRestored(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run once on mount

  // Persist to localStorage whenever the dataset is ready and changes
  // (e.g., as geocoding fills in coordinates).
  useEffect(() => {
    if (step === "ready" && records.length > 0) {
      saveSession(records, fileName);
    }
  }, [records, step, fileName]);
  // ──────────────────────────────────────────────────────────────────────────

  // Whether the current session was auto-restored from localStorage
  const [sessionRestored, setSessionRestored] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<"map" | "list" | "export" | "instructions">("map");

  const applyParseResult = useCallback((result: Awaited<ReturnType<typeof parseFile>>) => {
    setHeaders(result.headers);
    setRawRows(result.rows);
    setFileName(result.fileName);
    setSheets(result.sheets);
    setActiveSheet(result.activeSheet);
    setMapping(autoDetectMapping(result.headers));
  }, []);

  const handleFileAccepted = useCallback(async (file: File) => {
    setError(null);
    setStep("parsing");
    setUploadedFile(file);
    try {
      const result = await parseFile(file);
      applyParseResult(result);
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
      setStep("error");
    }
  }, [applyParseResult]);

  // Called when user picks a different sheet in the ColumnMapper
  const handleSheetChange = useCallback(async (sheetName: string) => {
    if (!uploadedFile || sheetName === activeSheet) return;
    setIsReparsingSheet(true);
    try {
      const result = await parseFile(uploadedFile, sheetName);
      applyParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sheet");
    } finally {
      setIsReparsingSheet(false);
    }
  }, [uploadedFile, activeSheet, applyParseResult]);

  const handleMappingConfirmed = useCallback((confirmedMapping: ColumnMapping) => {
    setMapping(confirmedMapping);
    setStep("cleaning");
    const cleaned = cleanAndNormalize(rawRows, confirmedMapping);
    setRecords(cleaned);
    setStep("geocoding");
  }, [rawRows]);

  const handleStartGeocoding = useCallback(async () => {
    await startGeocoding();
    setStep("ready");
  }, [startGeocoding]);

  const handleReset = useCallback(() => {
    clearSession();
    setStep("idle");
    setError(null);
    setUploadedFile(null);
    setHeaders([]);
    setRawRows([]);
    setFileName("");
    setSheets([]);
    setActiveSheet("");
    setMapping(null);
    setRecords([]);
    setSelectedId(null);
    setFilters(INITIAL_FILTERS);
  }, []);

  const handleDoctorSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActiveTab("map");
  }, []);

  // Memoised — only recomputes when records or filters actually change,
  // not on every unrelated state update (selectedId, activeTab, etc.)
  const filteredRecords = useMemo(() => records.filter((r) => {
    const q = filters.search.toLowerCase();
    if (q && !r.doctorName.toLowerCase().includes(q) && !r.clinic.toLowerCase().includes(q) && !r.specialty.toLowerCase().includes(q)) return false;
    if (filters.city && r.city.toLowerCase() !== filters.city.toLowerCase()) return false;
    if (filters.county && r.county.toLowerCase() !== filters.county.toLowerCase()) return false;
    if (filters.specialty && r.specialty.toLowerCase() !== filters.specialty.toLowerCase()) return false;
    if (filters.address && r.fullAddress !== filters.address) return false;
    if (filters.geocodingStatus === "geocoded" && r.geocodingStatus !== "geocoded") return false;
    if (filters.geocodingStatus === "failed" && r.geocodingStatus !== "failed") return false;
    return true;
  }), [records, filters]);

  const geocodedCount = records.filter((r) => r.geocodingStatus === "geocoded").length;
  const failedCount = records.filter((r) => r.geocodingStatus === "failed").length;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-9 md:h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold text-slate-900 leading-tight">ClinicAtlas</h1>
            <p className="hidden md:block text-xs text-slate-500">Excel → Interactive Map → Google My Maps</p>
          </div>
        </div>
        {step !== "idle" && (
          <div className="flex items-center gap-2 md:gap-3">
            {fileName && (
              <span className="hidden md:flex text-sm text-slate-500 items-center gap-1">
                <FileSpreadsheet className="w-4 h-4" /> {fileName}
              </span>
            )}
            <button
              onClick={handleReset}
              className="text-xs md:text-sm text-red-500 hover:text-red-700 font-medium transition-colors px-2 md:px-3 py-1 rounded border border-red-200 hover:border-red-300 hover:bg-red-50"
            >
              <span className="hidden md:inline">Start Over</span>
              <span className="md:hidden">Reset</span>
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        {/* IDLE: Upload screen + How It Works — single scrollable container */}
        {step === "idle" && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Upload section — flex-1 so it fills the viewport and centers its content */}
            <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 max-w-3xl mx-auto w-full">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Map Your Doctors</h2>
                <p className="text-slate-500 md:text-lg max-w-lg mx-auto">
                  Upload an Excel or CSV file with doctor data. We will clean it, geocode the addresses, and put them on an interactive map ready for Google My Maps.
                </p>
              </div>
              <FileUpload onFileAccepted={handleFileAccepted} />
              <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
                <span>Want to try it out?</span>
                <a
                  href="/sample_doctors.csv"
                  download
                  className="text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2"
                >
                  Download sample file
                </a>
              </div>
            </div>

            {/* How It Works — always below upload, revealed by scrolling on small screens */}
            <div className="bg-white border-t border-slate-200 flex-shrink-0">
              <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
                <h3 className="text-lg font-bold text-slate-800 mb-6 text-center">How It Works</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {[
                    { step: "1", icon: "📂", title: "Upload",      desc: "Upload your .xlsx, .xls, or .csv file with doctor data" },
                    { step: "2", icon: "🗺️", title: "Map Columns", desc: "Confirm which columns map to doctor name, address, phone, etc." },
                    { step: "3", icon: "📍", title: "Geocode",     desc: "We automatically convert addresses to GPS coordinates" },
                    { step: "4", icon: "💾", title: "Export",      desc: "Download a clean CSV ready to import into Google My Maps" },
                  ].map((item) => (
                    <div key={item.step} className="text-center">
                      <div className="text-3xl mb-3">{item.icon}</div>
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Step {item.step}</div>
                      <div className="font-semibold text-slate-800 mb-1">{item.title}</div>
                      <div className="text-sm text-slate-500">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PARSING: Loading */}
        {step === "parsing" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Parsing your file&hellip;</p>
            </div>
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <h3 className="font-semibold text-red-800 mb-2">Something went wrong</h3>
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <button onClick={handleReset} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* MAPPING: Column mapper + preview */}
        {step === "mapping" && mapping && (
          <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 mb-1">Map Your Columns</h2>
              <p className="text-slate-500 text-sm">
                We detected {rawRows.length} rows in <strong>{fileName}</strong>. Confirm which column maps to which field.
              </p>
            </div>
            <ColumnMapper
              headers={headers}
              initialMapping={mapping}
              onConfirm={handleMappingConfirmed}
              sheets={sheets}
              activeSheet={activeSheet}
              onSheetChange={handleSheetChange}
              isReparsingSheet={isReparsingSheet}
            />
            <div className="mt-6">
              <DataPreview headers={headers} rows={rawRows.slice(0, 5)} />
            </div>
          </div>
        )}

        {/* CLEANING */}
        {step === "cleaning" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Cleaning and normalizing data&hellip;</p>
            </div>
          </div>
        )}

        {/* GEOCODING: Progress screen */}
        {step === "geocoding" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-2xl mx-auto w-full">
            <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Data cleaned successfully</h3>
                  <p className="text-sm text-slate-500">{records.length} records ready for geocoding</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900">{records.length}</div>
                  <div className="text-xs text-slate-500 mt-1">Total records</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700">
                    {records.filter((r) => r.hasIncompleteAddress).length}
                  </div>
                  <div className="text-xs text-amber-600 mt-1">Incomplete addresses</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">
                    {records.filter((r) => r.isDuplicate).length}
                  </div>
                  <div className="text-xs text-blue-600 mt-1">Duplicates found</div>
                </div>
              </div>

              {isGeocoding ? (
                <>
                  <ProgressIndicator progress={progress} />
                  <button
                    onClick={stopGeocoding}
                    className="mt-4 w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                  >
                    Stop Geocoding
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleStartGeocoding}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Map className="w-5 h-5" />
                    Start Geocoding &amp; Build Map
                  </button>
                  <button
                    onClick={() => setStep("ready")}
                    className="mt-3 w-full px-4 py-2 text-slate-500 text-sm hover:text-slate-700 transition-colors"
                  >
                    Skip geocoding, go to map anyway
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* READY: Full map + sidebar view */}
        {step === "ready" && records.length > 0 && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* ── Desktop stats + tab bar ─────────────────────────────────────── */}
            <div className="hidden md:flex bg-white border-b border-slate-200 px-4 py-2 items-center gap-4 text-sm flex-wrap">
              <span className="text-slate-600">
                <strong className="text-slate-900">{records.length}</strong> doctors
              </span>
              <span className="text-green-600">
                <strong>{geocodedCount}</strong> geocoded
              </span>
              {failedCount > 0 && (
                <span className="text-amber-600">
                  <strong>{failedCount}</strong> unresolved
                </span>
              )}
              {sessionRestored && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Restored from last session
                </span>
              )}
              <div className="ml-auto flex gap-1">
                {(["map", "list", "export", "instructions"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      "px-3 py-1 rounded-md text-sm font-medium transition-colors capitalize",
                      activeTab === tab ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {tab === "map" && <Map className="w-4 h-4 inline mr-1" />}
                    {tab === "list" && <List className="w-4 h-4 inline mr-1" />}
                    {tab === "export" && <Download className="w-4 h-4 inline mr-1" />}
                    {tab === "instructions" && <BookOpen className="w-4 h-4 inline mr-1" />}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Mobile stats bar (no tabs — navigation is at bottom) ─────────── */}
            <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 text-sm flex-wrap">
              <span className="text-slate-600">
                <strong className="text-slate-900">{records.length}</strong> doctors
              </span>
              <span className="text-green-600">
                <strong>{geocodedCount}</strong> geocoded
              </span>
              {failedCount > 0 && (
                <span className="text-amber-600">
                  <strong>{failedCount}</strong> failed
                </span>
              )}
              {sessionRestored && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 ml-auto">
                  <CheckCircle2 className="w-3 h-3" /> Restored
                </span>
              )}
            </div>

            {/* ── MAP tab ──────────────────────────────────────────────────────── */}
            {/*
              Always mounted (hidden via CSS when not active) to keep Leaflet alive.
              On desktop: sidebar (w-80) + map side by side.
              On mobile: full-screen map only (doctors list is in its own tab).
            */}
            <div className={clsx("flex-1 flex overflow-hidden min-h-0", activeTab !== "map" && "hidden")}>
              {/* Desktop sidebar */}
              <div className="hidden md:flex w-80 flex-col border-r border-slate-200 bg-white overflow-hidden">
                <div className="p-3 border-b border-slate-100">
                  <FilterPanel
                    records={records}
                    filters={filters}
                    onFiltersChange={setFilters}
                  />
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll">
                  <DoctorList
                    records={filteredRecords}
                    selectedId={selectedId}
                    onSelect={handleDoctorSelect}
                  />
                </div>
              </div>
              {/* Map fills the rest */}
              <div className="flex-1 relative overflow-hidden">
                <MapView
                  records={filteredRecords}
                  selectedId={selectedId}
                  onMarkerClick={setSelectedId}
                  onDeselect={() => setSelectedId(null)}
                  isVisible={activeTab === "map"}
                />
              </div>
            </div>

            {/* ── LIST tab ─────────────────────────────────────────────────────── */}
            {activeTab === "list" && (
              <>
                {/* Desktop: DataPreview table */}
                <div className="hidden md:flex flex-1 overflow-auto p-4 flex-col">
                  <FilterPanel records={records} filters={filters} onFiltersChange={setFilters} />
                  <div className="mt-4">
                    <DataPreview
                      headers={["doctorName", "fullAddress", "specialty", "schedule", "phone", "geocodingStatus"]}
                      rows={filteredRecords.map((r) => ({
                        doctorName: r.doctorName,
                        fullAddress: r.fullAddress,
                        specialty: r.specialty,
                        schedule: r.schedule,
                        phone: r.phone,
                        geocodingStatus: r.geocodingStatus,
                      }))}
                    />
                  </div>
                </div>
                {/* Mobile: DoctorList with filters (replaces the sidebar) */}
                <div className="flex md:hidden flex-1 flex-col overflow-hidden min-h-0">
                  <div className="p-3 border-b border-slate-100">
                    <FilterPanel
                      records={records}
                      filters={filters}
                      onFiltersChange={setFilters}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scroll">
                    <DoctorList
                      records={filteredRecords}
                      selectedId={selectedId}
                      onSelect={handleDoctorSelect}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── EXPORT tab ───────────────────────────────────────────────────── */}
            {activeTab === "export" && (
              <div className="flex-1 overflow-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
                <ExportPanel records={records} filters={filters} />
              </div>
            )}

            {/* ── INSTRUCTIONS tab ─────────────────────────────────────────────── */}
            {activeTab === "instructions" && (
              <div className="flex-1 overflow-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
                <Instructions />
              </div>
            )}

            {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
            <nav className="md:hidden bg-white border-t border-slate-200 flex flex-shrink-0">
              {(
                [
                  { id: "map",          label: "Map",     Icon: Map      },
                  { id: "list",         label: "Doctors", Icon: Users    },
                  { id: "export",       label: "Export",  Icon: Download },
                  { id: "instructions", label: "Guide",   Icon: BookOpen },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={clsx(
                    "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors",
                    activeTab === id ? "text-blue-600" : "text-slate-500"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}

      </main>
    </div>
  );
}
