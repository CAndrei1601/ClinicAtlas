/**
 * mapInteraction.test.tsx
 *
 * NEW tests for the "random location on click" bug and related edge cases:
 *
 * ROOT CAUSES discovered:
 *   A) dataCleaner did not normalise city/county case → "CLUJ" vs "Cluj" built
 *      two different fullAddress strings → two cache keys → two slightly different
 *      coordinate pairs for the same doctor.
 *
 *   B) FlyToSelected used useEffect to keep the records ref current (async).
 *      In edge-cases this could be stale when the flyTo effect fired.
 *      Fix: update ref synchronously during render.
 *
 * Tests cover:
 *   1. City/county normalisation in dataCleaner
 *   2. FlyToSelected flies to the EXACT coordinates of the clicked doctor
 *   3. Clicking quickly between doctors always lands on the LAST clicked one
 *   4. No flyTo when the selected doctor has no geocoded coordinates
 *   5. Records updating (geocoding completing) while a doctor is selected
 *      does NOT re-fire flyTo
 *   6. flyTo fires correctly after records update IF the user re-clicks
 *   7. Selecting a doctor not present in the current filtered records is
 *      gracefully handled (no flyTo, no crash)
 */

import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import { cleanAndNormalize } from "@/services/dataCleaner";
import type { ColumnMapping, DoctorRecord, RawRow } from "@/types";

// ─── Mock Leaflet + react-leaflet (same stable-reference pattern) ─────────────

const mockFlyTo        = jest.fn();
const mockInvalidateSize = jest.fn();

// Controls whether getBounds().contains() returns true (point already visible)
// Tests that want flyTo suppressed should set this to true.
let mockContainsResult = false;

jest.mock("leaflet", () => {
  function IconDefaultMock() {}
  IconDefaultMock.prototype = {};
  IconDefaultMock.mergeOptions = jest.fn();
  function IconMock() {
    return { iconUrl: "", iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] };
  }
  // Minimal latLng factory — just returns the value so getBounds().contains() can use it
  const latLng = (lat: number, lng: number) => ({ lat, lng });
  return {
    __esModule: true,
    default: { Icon: Object.assign(IconMock, { Default: IconDefaultMock }), latLng },
    Icon:     Object.assign(IconMock, { Default: IconDefaultMock }),
    latLng,
  };
});

const mockPanTo     = jest.fn();
let   mockZoomLevel = 7; // default: zoomed out → flyTo branch

const mockGetBounds = jest.fn(() => ({
  contains: jest.fn(() => mockContainsResult),
}));

const mockMapInstance = {
  flyTo: mockFlyTo,
  panTo: mockPanTo,
  invalidateSize: mockInvalidateSize,
  getBounds: mockGetBounds,
  getZoom: jest.fn(() => mockZoomLevel),
  // CardPositionTracker uses this to convert lat/lng → pixel position
  latLngToContainerPoint: jest.fn(() => ({ x: 100, y: 200 })),
};

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div />,
  Marker: ({
    children,
    eventHandlers,
    position,
  }: {
    children?: React.ReactNode;
    eventHandlers?: { click?: () => void };
    position: [number, number];
  }) => (
    <div
      data-testid="marker"
      data-lat={position[0]}
      data-lng={position[1]}
      onClick={eventHandlers?.click}
    >
      {children}
    </div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMap: () => mockMapInstance,
  useMapEvents: (_handlers: Record<string, () => void>) => mockMapInstance,
}));

jest.mock("react-leaflet-cluster", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MapView = require("@/components/MapView").default as React.ComponentType<{
  records: DoctorRecord[];
  selectedId: string | null;
  onMarkerClick: (id: string) => void;
  onDeselect: () => void;
  isVisible?: boolean;
}>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFlyTo.mockClear();
  mockPanTo.mockClear();
  mockInvalidateSize.mockClear();
  mockGetBounds.mockClear();
  mockContainsResult = false; // default: point NOT in bounds → movement fires
  mockZoomLevel      = 7;    // default: zoomed out → flyTo branch (zoom < 12)
});

function geocoded(overrides: Partial<DoctorRecord> = {}): DoctorRecord {
  return {
    id: "doc-1",
    doctorName: "Dr. Test",
    address: "Strada Clinicilor Nr. 1",
    city: "Cluj-Napoca",
    county: "Cluj",
    schedule: "",
    phone: "",
    clinic: "",
    specialty: "",
    country: "Romania",
    fullAddress: "Strada Clinicilor Nr. 1, Cluj-Napoca, Cluj, Romania",
    latitude:  46.7652868,
    longitude: 23.5802072,
    geocodingStatus: "geocoded",
    hasIncompleteAddress: false,
    isDuplicate: false,
    rowIndex: 2,
    ...overrides,
  };
}

function pending(overrides: Partial<DoctorRecord> = {}): DoctorRecord {
  return geocoded({
    id: "doc-pending",
    geocodingStatus: "pending",
    latitude: null,
    longitude: null,
    ...overrides,
  });
}

// ─── PART 1: dataCleaner city/county normalisation ────────────────────────────

describe("dataCleaner — city and county Title Case normalisation (Bug A)", () => {
  const MAPPING: ColumnMapping = {
    doctorName: "Medic",
    address:    "Adresa",
    city:       "Oras",
    county:     "Judet",
    schedule:   null,
    phone:      null,
    clinic:     null,
    specialty:  null,
    country:    null,
  };

  function row(city: string, county: string): RawRow {
    return { Medic: "Dr. A", Adresa: "Str. Test Nr. 1", Oras: city, Judet: county };
  }

  it("normalises ALL-CAPS city to Title Case", () => {
    const [r] = cleanAndNormalize([row("CLUJ NAPOCA", "CLUJ")], MAPPING);
    expect(r.city).toBe("Cluj Napoca");
    expect(r.county).toBe("Cluj");
  });

  it("normalises ALL-CAPS multi-word city to Title Case", () => {
    const [r] = cleanAndNormalize([row("TARGU MURES", "MURES")], MAPPING);
    expect(r.city).toBe("Targu Mures");
    expect(r.county).toBe("Mures");
  });

  it("leaves already Title Case city unchanged", () => {
    const [r] = cleanAndNormalize([row("Cluj-Napoca", "Cluj")], MAPPING);
    expect(r.city).toBe("Cluj-Napoca");
    expect(r.county).toBe("Cluj");
  });

  it("produces an identical fullAddress for UPPERCASE and Title Case variants", () => {
    const [upper] = cleanAndNormalize([row("CLUJ NAPOCA", "CLUJ")],   MAPPING);
    const [title] = cleanAndNormalize([row("Cluj Napoca", "Cluj")],   MAPPING);
    // Both should produce the same fullAddress → same cache key
    expect(upper.fullAddress).toBe(title.fullAddress);
  });

  it("UPPERCASE and Title Case inputs produce the same cache key (fullAddress)", () => {
    const variants = [
      row("CLUJ",          "CLUJ"),
      row("Cluj",          "Cluj"),
      row("cluj",          "cluj"),
      row("CLUJ NAPOCA",   "CLUJ"),
      row("Cluj Napoca",   "Cluj"),
    ];
    const results = cleanAndNormalize(variants, MAPPING);
    // After normalisation, city should be consistent
    const cities = Array.from(new Set(results.map((r) => r.city)));
    // Should only be 2 distinct normalised cities: "Cluj" and "Cluj Napoca"
    expect(cities).toHaveLength(2);
    expect(cities).toContain("Cluj");
    expect(cities).toContain("Cluj Napoca");
  });

  it("normalises country field to Title Case", () => {
    const mappingWithCountry: ColumnMapping = { ...MAPPING, country: "Tara" };
    const [r] = cleanAndNormalize([{ ...row("Cluj", "Cluj"), Tara: "ROMANIA" }], mappingWithCountry);
    expect(r.country).toBe("Romania");
  });
});

// ─── PART 2: FlyToSelected — synchronous ref guarantees correct coords ─────────

describe("FlyToSelected — flies to exact coordinates of the clicked doctor (Bug B)", () => {
  it("flies to the clicked doctor's precise coordinates, not a neighbour's", () => {
    const docA = geocoded({ id: "doc-A", latitude: 46.7652, longitude: 23.5802 });
    const docB = geocoded({ id: "doc-B", latitude: 45.7831, longitude: 24.1597 });
    const docC = geocoded({ id: "doc-C", latitude: 44.4268, longitude: 26.1025 });

    const { rerender } = render(
      <MapView records={[docA, docB, docC]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    // User clicks doctor B
    rerender(<MapView records={[docA, docB, docC]} selectedId="doc-B" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 45.7831, lng: 24.1597 }), 15, { duration: 0.8 });
  });

  it("switching selection between doctors always lands on the LAST clicked one", () => {
    const doctors = [
      geocoded({ id: "d1", latitude: 46.77,  longitude: 23.60 }),
      geocoded({ id: "d2", latitude: 45.78,  longitude: 24.16 }),
      geocoded({ id: "d3", latitude: 44.43,  longitude: 26.10 }),
      geocoded({ id: "d4", latitude: 47.05,  longitude: 21.93 }),
    ];

    const { rerender } = render(
      <MapView records={doctors} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    // Rapidly click d1 → d3 → d2 → d4
    for (const [id, lat, lng] of [
      ["d1", 46.77,  23.60],
      ["d3", 44.43,  26.10],
      ["d2", 45.78,  24.16],
      ["d4", 47.05,  21.93],
    ] as [string, number, number][]) {
      mockFlyTo.mockClear();
      rerender(<MapView records={doctors} selectedId={id} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
      expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: lat, lng: lng }), 15, { duration: 0.8 });
      expect(mockFlyTo).toHaveBeenCalledTimes(1);
    }
  });

  it("does NOT fly when the selected doctor has no geocoded coordinates", () => {
    const doc = pending({ id: "p1" });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    rerender(<MapView records={[doc]} selectedId="p1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).not.toHaveBeenCalled();
  });

  it("does NOT fly when the selected doctor failed geocoding", () => {
    const doc = pending({ id: "f1", geocodingStatus: "failed" });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    rerender(<MapView records={[doc]} selectedId="f1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).not.toHaveBeenCalled();
  });

  it("does NOT fly when selectedId points to a doctor not in the current records", () => {
    const doc = geocoded({ id: "doc-visible" });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    // selectedId belongs to a record that was filtered out (not in records)
    rerender(<MapView records={[doc]} selectedId="doc-invisible" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).not.toHaveBeenCalled();
  });
});

// ─── PART 3: records updating mid-session (geocoding completing) ──────────────

describe("FlyToSelected — records updating while doctor is selected", () => {
  it("does NOT re-fire flyTo when new records arrive but selectedId is unchanged", () => {
    const selected = geocoded({ id: "selected" });
    const { rerender } = render(
      <MapView records={[selected]} selectedId="selected" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    mockFlyTo.mockClear();

    // More doctors finish geocoding → records array grows
    const newlyGeocoded = geocoded({ id: "new-doc", latitude: 47.05, longitude: 21.93 });
    rerender(
      <MapView records={[selected, newlyGeocoded]} selectedId="selected" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    expect(mockFlyTo).not.toHaveBeenCalled();
  });

  it("uses fresh coordinates when records update THEN user re-selects", () => {
    // Doctor starts as pending
    const doc = pending({ id: "doc-updating" });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    // User clicks the pending doctor — no flyTo because no coords yet
    rerender(<MapView records={[doc]} selectedId="doc-updating" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).not.toHaveBeenCalled();

    // Geocoding completes — record now has coordinates
    const docGeocoded = {
      ...doc,
      latitude: 46.7652,
      longitude: 23.5802,
      geocodingStatus: "geocoded" as const,
    };
    // Records update — selectedId unchanged — NO flyTo
    rerender(<MapView records={[docGeocoded]} selectedId="doc-updating" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).not.toHaveBeenCalled();

    // User clicks again (re-selects) — NOW flyTo fires with correct coords
    rerender(<MapView records={[docGeocoded]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    rerender(<MapView records={[docGeocoded]} selectedId="doc-updating" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 46.7652, lng: 23.5802 }), 15, { duration: 0.8 });
  });

  it("uses the LATEST coordinates when selectedId changes and records were updated", () => {
    const docA = geocoded({ id: "A", latitude: 46.77, longitude: 23.60 });
    const docB = pending({ id: "B" });

    const { rerender } = render(
      <MapView records={[docA, docB]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    // Geocoding completes for B — NEW records array with B now geocoded
    const docBGeocoded = {
      ...docB,
      latitude: 45.78,
      longitude: 24.16,
      geocodingStatus: "geocoded" as const,
    };

    // User clicks B right as geocoding finishes (records and selectedId change together)
    rerender(
      <MapView
        records={[docA, docBGeocoded]}
        selectedId="B"
        onMarkerClick={jest.fn()}
        onDeselect={jest.fn()}
      />
    );

    // Must fly to B's CORRECT (freshly geocoded) coordinates, not null
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 45.78, lng: 24.16 }), 15, { duration: 0.8 });
    expect(mockFlyTo).not.toHaveBeenCalledWith(expect.objectContaining({ lat: null, lng: null }), expect.anything(), expect.anything());
  });
});

// ─── PART 4: filter changes while doctor is selected ─────────────────────────

describe("FlyToSelected — filter changes while doctor is selected", () => {
  it("does NOT fly when filter removes selected doctor from visible records", () => {
    const docA = geocoded({ id: "A", city: "Cluj-Napoca" });
    const docB = geocoded({ id: "B", city: "Sibiu", latitude: 45.78, longitude: 24.16 });

    const { rerender } = render(
      <MapView records={[docA, docB]} selectedId="A" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    mockFlyTo.mockClear();

    // Filter to only Sibiu — docA filtered out, records = [docB] only
    rerender(<MapView records={[docB]} selectedId="A" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);

    // selectedId "A" not in records anymore → no flyTo
    expect(mockFlyTo).not.toHaveBeenCalled();
  });

  it("flies correctly when user picks a doctor from filtered results", () => {
    const docA = geocoded({ id: "A", latitude: 46.77, longitude: 23.60 });
    const docB = geocoded({ id: "B", latitude: 45.78, longitude: 24.16 });

    // Start with filter already applied — only docB visible
    const { rerender } = render(
      <MapView records={[docB]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    // User clicks docB
    rerender(<MapView records={[docB]} selectedId="B" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 45.78, lng: 24.16 }), 15, { duration: 0.8 });
  });
});

// ─── PART 4b: spiderfy / already-in-bounds guard ─────────────────────────────

describe("FlyToSelected — point already in viewport (spiderfy case)", () => {
  it("does NOT call flyTo or panTo when point is already within map bounds", () => {
    // Simulate clicking a marker inside a spiderfied cluster — already visible.
    mockContainsResult = true;

    const doc = geocoded({ id: "spider-1", latitude: 46.77, longitude: 23.60 });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    rerender(
      <MapView records={[doc]} selectedId="spider-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    expect(mockFlyTo).not.toHaveBeenCalled();
    expect(mockPanTo).not.toHaveBeenCalled();
  });

  it("calls flyTo (with zoom) when point is off-screen and map is zoomed out (< 12)", () => {
    // Default: mockContainsResult = false, mockZoomLevel = 7 → flyTo branch
    const doc = geocoded({ id: "far-1", latitude: 44.42, longitude: 26.10 });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    rerender(
      <MapView records={[doc]} selectedId="far-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 44.42, lng: 26.10 }),
      15,
      { duration: 0.8 }
    );
    expect(mockPanTo).not.toHaveBeenCalled();
  });

  it("calls panTo (no zoom change) when point is off-screen and map is already zoomed in (≥ 12)", () => {
    // Google Maps behaviour: if already at street level, just pan — don't zoom
    mockZoomLevel = 14; // zoomed in → panTo branch

    const doc = geocoded({ id: "near-1", latitude: 44.42, longitude: 26.10 });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    rerender(
      <MapView records={[doc]} selectedId="near-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    expect(mockPanTo).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 44.42, lng: 26.10 }),
      expect.objectContaining({ animate: true })
    );
    expect(mockFlyTo).not.toHaveBeenCalled();
  });
});

// ─── PART 5: map visibility toggle (tab switching) ───────────────────────────

describe("FlyToSelected — selection + map visibility", () => {
  it("flies to correct location when doctor selected while map is visible", async () => {
    const doc = geocoded({ id: "doc-1" });
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} isVisible={true} />
    );

    rerender(<MapView records={[doc]} selectedId="doc-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} isVisible={true} />);
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 46.7652868, lng: 23.5802072 }), 15, { duration: 0.8 });
  });

  it("invalidateSize is called when switching back to the map tab", async () => {
    const doc = geocoded();
    const { rerender } = render(
      <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} isVisible={false} />
    );
    expect(mockInvalidateSize).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        <MapView records={[doc]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} isVisible={true} />
      );
    });

    await waitFor(() => expect(mockInvalidateSize).toHaveBeenCalledTimes(1), { timeout: 300 });
  });
});
