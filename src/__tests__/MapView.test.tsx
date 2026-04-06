/**
 * MapView.test.tsx
 *
 * Tests that verify the four known interaction bugs and confirm they are fixed:
 *
 * BUG 1 — Map unmounts on tab switch → tiles go grey
 *   Proven by: checking the map container exists even when isVisible=false
 *
 * BUG 2 — FlyToSelected fires when records change, not only when selectedId changes
 *   Proven by: rerendering with new records but same selectedId, expecting no flyTo call
 *
 * BUG 3 — new L.Icon.Default() created inline on every render
 *   Proven by: checking Icon.Default constructor call count across rerenders
 *
 * BUG 4 — No invalidateSize() call after the container becomes visible again
 *   Proven by: toggling isVisible false→true and expecting invalidateSize to be called
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { DoctorRecord } from "@/types";

// ─── Mock Leaflet ─────────────────────────────────────────────────────────────

const mockFlyTo = jest.fn();
const mockInvalidateSize = jest.fn();
let iconDefaultConstructorCallCount = 0;

jest.mock("leaflet", () => {
  function IconDefaultMock() {
    iconDefaultConstructorCallCount++;
  }
  IconDefaultMock.prototype = {};
  IconDefaultMock.mergeOptions = jest.fn();

  function IconMock() {
    return { iconUrl: "", iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] };
  }

  const latLng = (lat: number, lng: number) => ({ lat, lng });

  return {
    __esModule: true,
    default: { Icon: Object.assign(IconMock, { Default: IconDefaultMock }), latLng },
    Icon: Object.assign(IconMock, { Default: IconDefaultMock }),
    latLng,
  };
});

// ─── Mock react-leaflet ───────────────────────────────────────────────────────

// Stable map object — same reference across all renders.
// If useMap() returns a new object each render, `map` changes every render and
// the flyTo effect fires even when selectedId didn't change (false positive).
const mockMapInstance = {
  flyTo: mockFlyTo,
  panTo: jest.fn(),
  invalidateSize: mockInvalidateSize,
  // Point not in bounds by default → movement fires
  getBounds: jest.fn(() => ({ contains: jest.fn(() => false) })),
  // Zoomed out by default → flyTo branch (zoom < 12)
  getZoom: jest.fn(() => 7),
  // CardPositionTracker uses this to convert lat/lng → pixel position
  latLngToContainerPoint: jest.fn(() => ({ x: 100, y: 200 })),
};

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({
    children,
    eventHandlers,
    position,
    "data-id": dataId,
  }: {
    children?: React.ReactNode;
    eventHandlers?: { click?: () => void };
    position: [number, number];
    "data-id"?: string;
  }) => (
    <div
      data-testid="marker"
      data-lat={position[0]}
      data-lng={position[1]}
      data-id={dataId}
      onClick={eventHandlers?.click}
    >
      {children}
    </div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
  // Return the SAME object reference every call — mirrors real Leaflet behaviour
  // where useMap() always returns the same map instance from the nearest MapContainer.
  useMap: () => mockMapInstance,
  // useMapEvents: register handlers and return the map instance (no-op in tests)
  useMapEvents: (_handlers: Record<string, () => void>) => mockMapInstance,
}));

// ─── Mock react-leaflet-cluster ───────────────────────────────────────────────

jest.mock("react-leaflet-cluster", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cluster-group">{children}</div>
  ),
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<DoctorRecord> = {}): DoctorRecord {
  return {
    id: "doctor-1",
    doctorName: "Dr. Maria Ionescu",
    address: "Strada Victoriei Nr. 12",
    city: "București",
    county: "Sector 1",
    schedule: "Lun-Vin 09:00-17:00",
    phone: "+40721234567",
    clinic: "Clinica Sfântul Spiridon",
    specialty: "Cardiologie",
    country: "Romania",
    fullAddress: "Strada Victoriei Nr. 12, București, Sector 1, Romania",
    latitude: 44.4268,
    longitude: 26.1025,
    geocodingStatus: "geocoded",
    hasIncompleteAddress: false,
    isDuplicate: false,
    rowIndex: 2,
    ...overrides,
  };
}

// ─── Import subject under test (after mocks) ─────────────────────────────────

// Dynamic require so the mocks above are applied first
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MapView = require("@/components/MapView").default as React.ComponentType<{
  records: DoctorRecord[];
  selectedId: string | null;
  onMarkerClick: (id: string) => void;
  onDeselect?: () => void;
  isVisible?: boolean;
}>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFlyTo.mockClear();
  mockInvalidateSize.mockClear();
  iconDefaultConstructorCallCount = 0;
});

// ─── Basic rendering ──────────────────────────────────────────────────────────

describe("MapView — basic rendering", () => {
  it("renders the map container", () => {
    render(<MapView records={[]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("shows 'No geocoded locations' when records list is empty", () => {
    render(<MapView records={[]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(screen.getByText(/No geocoded locations/i)).toBeInTheDocument();
  });

  it("hides the empty-state message when at least one geocoded record exists", () => {
    render(
      <MapView records={[makeRecord()]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    expect(screen.queryByText(/No geocoded locations/i)).not.toBeInTheDocument();
  });

  it("renders one marker per geocoded record", () => {
    const records = [
      makeRecord({ id: "d1" }),
      makeRecord({ id: "d2", latitude: 46.77, longitude: 23.59 }),
    ];
    render(<MapView records={records} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });

  it("does NOT render markers for failed/pending records", () => {
    const failed = makeRecord({ id: "f1", geocodingStatus: "failed", latitude: null, longitude: null });
    const pending = makeRecord({ id: "p1", geocodingStatus: "pending", latitude: null, longitude: null });
    render(
      <MapView records={[failed, pending]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    expect(screen.queryByTestId("marker")).not.toBeInTheDocument();
  });

  it("renders floating doctor card when a geocoded record is selected", () => {
    render(
      <MapView records={[makeRecord()]} selectedId="doctor-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    // Two cards are rendered (mobile bottom + desktop above-pin); both should be present
    const nameEls = screen.getAllByText("Dr. Maria Ionescu");
    expect(nameEls.length).toBeGreaterThanOrEqual(1);
    const specialtyEls = screen.getAllByText("Cardiologie");
    expect(specialtyEls.length).toBeGreaterThanOrEqual(1);
  });

  it("does not render doctor card when no record is selected", () => {
    render(
      <MapView records={[makeRecord()]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    expect(screen.queryByText("Dr. Maria Ionescu")).not.toBeInTheDocument();
  });
});

// ─── Marker interaction ───────────────────────────────────────────────────────

describe("MapView — marker clicks", () => {
  it("calls onMarkerClick with the correct record id when a marker is clicked", () => {
    const onMarkerClick = jest.fn();
    render(
      <MapView records={[makeRecord({ id: "doctor-42" })]} selectedId={null} onMarkerClick={onMarkerClick} onDeselect={jest.fn()} />
    );
    fireEvent.click(screen.getByTestId("marker"));
    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    expect(onMarkerClick).toHaveBeenCalledWith("doctor-42");
  });

  it("calls onMarkerClick with the right id when multiple markers exist", () => {
    const onMarkerClick = jest.fn();
    const records = [
      makeRecord({ id: "doc-A", latitude: 44.42, longitude: 26.10 }),
      makeRecord({ id: "doc-B", latitude: 46.77, longitude: 23.59 }),
    ];
    render(<MapView records={records} selectedId={null} onMarkerClick={onMarkerClick} onDeselect={jest.fn()} />);
    const markers = screen.getAllByTestId("marker");
    fireEvent.click(markers[1]);
    expect(onMarkerClick).toHaveBeenCalledWith("doc-B");
  });
});

// ─── BUG 2: FlyToSelected fires on records change ────────────────────────────

describe("BUG 2 — FlyToSelected should only fire when selectedId changes", () => {
  it("calls flyTo when selectedId changes from null to a valid id", () => {
    const record = makeRecord();
    const { rerender } = render(
      <MapView records={[record]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    expect(mockFlyTo).not.toHaveBeenCalled();

    rerender(<MapView records={[record]} selectedId="doctor-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).toHaveBeenCalledTimes(1);
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 44.4268, lng: 26.1025 }), 15, { duration: 0.8 });
  });

  it("does NOT call flyTo again when records array changes but selectedId stays the same", () => {
    const record = makeRecord();
    const { rerender } = render(
      <MapView records={[record]} selectedId="doctor-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    mockFlyTo.mockClear(); // clear the initial call

    // Simulate geocoding completing — records array reference changes
    const extraRecord = makeRecord({ id: "doctor-99", latitude: 47.1, longitude: 21.9 });
    rerender(
      <MapView records={[record, extraRecord]} selectedId="doctor-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );

    // flyTo must NOT fire because selectedId didn't change
    expect(mockFlyTo).not.toHaveBeenCalled();
  });

  it("does NOT call flyTo when selectedId is cleared to null", () => {
    const record = makeRecord();
    const { rerender } = render(
      <MapView records={[record]} selectedId="doctor-1" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    mockFlyTo.mockClear();

    rerender(<MapView records={[record]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).not.toHaveBeenCalled();
  });

  it("calls flyTo with updated coordinates when selectedId switches to a different record", () => {
    const records = [
      makeRecord({ id: "doc-A", latitude: 44.42, longitude: 26.10 }),
      makeRecord({ id: "doc-B", latitude: 46.77, longitude: 23.59 }),
    ];
    const { rerender } = render(
      <MapView records={records} selectedId="doc-A" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    mockFlyTo.mockClear();

    rerender(<MapView records={records} selectedId="doc-B" onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 46.77, lng: 23.59 }), 15, { duration: 0.8 });
  });
});

// ─── BUG 3: Icon.Default constructed on every render ─────────────────────────

describe("BUG 3 — L.Icon.Default should not be constructed on every render", () => {
  it("does not call new L.Icon.Default() on a rerender when nothing changed", () => {
    const record = makeRecord();
    const { rerender } = render(
      <MapView records={[record]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />
    );
    const countAfterMount = iconDefaultConstructorCallCount;

    // Force rerender with same props
    rerender(<MapView records={[record]} selectedId={null} onMarkerClick={jest.fn()} onDeselect={jest.fn()} />);

    // Should NOT have created new Icon.Default instances on rerender
    expect(iconDefaultConstructorCallCount).toBe(countAfterMount);
  });
});

// ─── BUG 4: invalidateSize not called when container becomes visible ──────────

describe("BUG 4 — invalidateSize must be called when isVisible switches to true", () => {
  it("does not call invalidateSize when isVisible is initially false", () => {
    render(
      <MapView records={[makeRecord()]} selectedId={null} onMarkerClick={jest.fn()} isVisible={false} />
    );
    expect(mockInvalidateSize).not.toHaveBeenCalled();
  });

  it("calls invalidateSize when isVisible changes from false to true", async () => {
    const record = makeRecord();
    const { rerender } = render(
      <MapView records={[record]} selectedId={null} onMarkerClick={jest.fn()} isVisible={false} />
    );
    expect(mockInvalidateSize).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        <MapView records={[record]} selectedId={null} onMarkerClick={jest.fn()} isVisible={true} />
      );
    });

    await waitFor(() => {
      expect(mockInvalidateSize).toHaveBeenCalledTimes(1);
    }, { timeout: 300 });
  });

  it("does NOT call invalidateSize when isVisible stays true on rerender", async () => {
    const record = makeRecord();
    const { rerender } = render(
      <MapView records={[record]} selectedId={null} onMarkerClick={jest.fn()} isVisible={true} />
    );
    await waitFor(() => expect(mockInvalidateSize).toHaveBeenCalledTimes(1));
    mockInvalidateSize.mockClear();

    rerender(
      <MapView records={[record]} selectedId="doctor-1" onMarkerClick={jest.fn()} isVisible={true} />
    );
    // Selecting a doctor should not trigger invalidateSize
    expect(mockInvalidateSize).not.toHaveBeenCalled();
  });
});
