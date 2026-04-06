# ClinicAtlas

A production-ready web application for mapping doctors from Excel spreadsheets. Upload an `.xlsx`, `.xls`, or `.csv` file, automatically geocode all addresses using OpenStreetMap Nominatim (free, no API key required), visualize them on an interactive Leaflet map, and export a clean CSV ready to import into Google My Maps.

---

## Features

- **File upload** — drag-and-drop or click to browse; supports `.xlsx`, `.xls`, `.csv`, `.ods`
- **Smart column mapping** — auto-detects column names (Romanian and English keywords); user-editable
- **Data cleaning** — normalizes Romanian/European address abbreviations (STR. → Strada, BD. → Bulevardul, etc.), trims whitespace, detects duplicates and incomplete addresses
- **Geocoding** — server-side geocoding via Nominatim (OpenStreetMap); file-based cache prevents re-geocoding the same address; respects 1 req/sec rate limit
- **Interactive map** — react-leaflet with marker clustering; click a doctor in the sidebar to fly to their pin; color-coded selected marker
- **Filtering** — search by name/clinic/specialty; filter by city, county, specialty, geocoding status
- **Export** — multiple CSV export options (geocoded only, filtered, all, unresolved) with UTF-8 BOM for correct Excel rendering
- **Google My Maps instructions** — built-in step-by-step guide for importing the CSV

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Excel parsing | SheetJS (xlsx) |
| CSV parsing | PapaParse |
| Map | Leaflet + react-leaflet + react-leaflet-cluster |
| Geocoding | Nominatim (OpenStreetMap) — free, no API key |
| Icons | lucide-react |
| File export | file-saver |
| IDs | uuid v4 |

---

## Setup

### Prerequisites

- Node.js 18+ and npm (or yarn/pnpm)

### Installation

```bash
cd clinic-atlas
npm install
```

### Environment (optional)

Copy `.env.example` to `.env.local` and adjust if needed:

```bash
cp .env.example .env.local
```

The defaults work out of the box. The only env vars are:

| Variable | Default | Description |
|---|---|---|
| `NOMINATIM_USER_AGENT` | `clinic-atlas/1.0` | User-Agent header sent to Nominatim |
| `GEOCODING_CACHE_PATH` | `./geocoding-cache.json` | Path for the geocoding cache file |

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
npm run build
npm start
```

---

## Usage Guide

### Step 1: Upload your file

Drag and drop (or click to browse) an Excel or CSV file. The file must contain at least a doctor name column and a city/address column. Download `/sample_doctors.csv` to see the expected format.

### Step 2: Map columns

The app auto-detects common column names in Romanian and English. Review the mapping and adjust any incorrectly detected columns. Only **Doctor Name** and **City** are required — all other fields are optional.

### Step 3: Geocode

After confirming the column mapping, the app shows a summary of the cleaned data:

- **Incomplete addresses** — rows with no city and no address (will be skipped)
- **Duplicates** — rows with the same name + address combination (will be skipped)

Click **Start Geocoding & Build Map** to begin. Geocoding calls the `/api/geocode` route which proxies to Nominatim with caching. You can stop at any time and still view/export the partial results.

You may also click **Skip geocoding** to go straight to the map without coordinates.

### Step 4: Explore the map

- The left sidebar shows a filterable, scrollable list of all doctors
- Click a doctor in the list to fly to their pin on the map
- Click a map marker to see a popup with full details
- Use the **List** tab for a tabular view
- Use the **Export** tab to download CSV files
- Use the **Instructions** tab for Google My Maps import steps

---

## Geocoding Notes

### Nominatim rate limits

Nominatim (the free OpenStreetMap geocoding service) enforces a **maximum of 1 request per second**. The app respects this with a 1,100 ms delay between requests and processes records in batches of 5.

For large datasets (hundreds or thousands of doctors), geocoding may take several minutes. The app shows a real-time progress bar.

### Caching

All geocoded results are saved to `geocoding-cache.json` in the project root. Subsequent geocoding runs skip already-cached addresses and respond instantly. The cache is excluded from git by default (see `.gitignore`).

To clear the cache, delete `geocoding-cache.json`.

### Improving geocoding accuracy

If many addresses fail to geocode:

1. Download the **Unresolved addresses** CSV from the Export tab
2. Manually correct the addresses (check spelling, add missing city/county)
3. Re-upload the corrected file

Common issues with Romanian addresses:
- Block apartment format: include `Bl.` and `Sc.` in the address field
- Avoid abbreviations that are not expanded by the cleaner
- Make sure the county name matches the actual Romanian county (e.g., "Cluj" not "Cluj-Napoca" for the county)

---

## Architecture

```
src/
├── app/
│   ├── layout.tsx          # Root layout with Inter font
│   ├── page.tsx            # Main page — all state lives here (step machine)
│   ├── globals.css         # Tailwind directives + Leaflet CSS import
│   └── api/geocode/        # Server-side geocoding proxy with file cache
│       └── route.ts
├── components/
│   ├── FileUpload.tsx      # Drag-and-drop file upload
│   ├── ColumnMapper.tsx    # Field mapping UI with auto-detection
│   ├── DataPreview.tsx     # Table preview of raw rows
│   ├── MapView.tsx         # Leaflet map (dynamic import, no SSR)
│   ├── DoctorList.tsx      # Scrollable doctor list sidebar
│   ├── FilterPanel.tsx     # Search + filter dropdowns
│   ├── ExportPanel.tsx     # CSV export buttons
│   ├── Instructions.tsx    # Google My Maps how-to guide
│   └── ProgressIndicator.tsx  # Geocoding progress bar
├── services/
│   ├── fileParser.ts       # XLSX + CSV parsing with SheetJS/PapaParse
│   ├── dataCleaner.ts      # Address normalization + duplicate detection
│   ├── geocoder.ts         # Client-side geocoding orchestration
│   └── csvExporter.ts      # CSV generation + file download
├── hooks/
│   └── useGeocoding.ts     # Geocoding state + abort controller
└── types/
    └── index.ts            # All shared TypeScript interfaces
```

### Page state machine

The main `page.tsx` uses a `ProcessingStep` enum to drive the UI:

```
idle → parsing → mapping → cleaning → geocoding → ready
```

Each step renders a different section. The `ready` step shows the full map+sidebar layout with tabs.

---

## Importing into Google My Maps

1. Go to [maps.google.com/maps/d](https://www.google.com/maps/d/) and sign in
2. Click **+ Create a new map**
3. Click **Import** under the first untitled layer
4. Upload `cleaned_doctors.csv`
5. Select `full_address` (or `latitude`/`longitude` for precise placement) as the location column
6. Select `doctor_name` as the marker title
7. Click **Finish** — your doctors will appear as pins on the map

**Tips:**
- Google My Maps supports up to 2,000 rows per layer — for larger datasets, split the CSV
- Create separate layers per specialty by exporting filtered CSVs
- To share: click Share → set "Anyone with the link can view"

---

## Sample File

`/public/sample_doctors.csv` contains 10 Romanian doctors across major cities. Download it from the app's home screen to test the full workflow.

---

## License

MIT
