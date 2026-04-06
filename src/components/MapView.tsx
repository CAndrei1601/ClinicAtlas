"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { DoctorRecord } from "@/types";
import { MapPin, Phone, Clock, Stethoscope, Building2, X } from "lucide-react";

// ─── Fix Leaflet's missing default icon paths under webpack/Next.js ───────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Stable icon constants — created once, never re-instantiated on re-render
const DEFAULT_ICON = new L.Icon.Default();
const SELECTED_ICON = new L.Icon({
  iconUrl:     "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:   "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
  shadowSize:  [41, 41],
});

// The icon anchor Y = 41px. The pin tip sits at the marker's lat/lng;
// the icon top is 41px above. We add an 8px gap → card bottom at (tip - 49px).
const ICON_HEIGHT_PX = 41;
const CARD_GAP_PX    = 8;

const TILE_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// ─── Card position tracker ───────────────────────────────────────────────────
// Lives INSIDE MapContainer so it can use useMap() + useMapEvents().
// Converts the selected marker's lat/lng to container-relative pixel coords
// and reports them upward via onPositionUpdate whenever the map moves/zooms.
function CardPositionTracker({
  selectedRecord,
  onPositionUpdate,
}: {
  selectedRecord: DoctorRecord | null;
  onPositionUpdate: (pos: { x: number; y: number } | null) => void;
}) {
  const map = useMap();

  const recalc = useCallback(() => {
    if (!selectedRecord?.latitude || !selectedRecord?.longitude) {
      onPositionUpdate(null);
      return;
    }
    const pt = map.latLngToContainerPoint([
      selectedRecord.latitude,
      selectedRecord.longitude,
    ]);
    onPositionUpdate({ x: pt.x, y: pt.y });
  }, [map, selectedRecord, onPositionUpdate]);

  // Recalculate on every map move / zoom so the card tracks the pin live
  useMapEvents({ move: recalc, zoom: recalc, moveend: recalc, zoomend: recalc });

  // Recalculate immediately when the selected record changes
  useEffect(() => { recalc(); }, [recalc]);

  return null;
}

// ─── Pan-to-selected ─────────────────────────────────────────────────────────
// Flies/pans only when the point is outside the current viewport.
// Keeps the map still when clicking inside a spiderfied cluster.
function FlyToSelected({
  records,
  selectedId,
}: {
  records: DoctorRecord[];
  selectedId: string | null;
}) {
  const map = useMap();
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    if (!selectedId) return;
    const record = recordsRef.current.find((r) => r.id === selectedId);
    if (!record?.latitude || !record?.longitude) return;

    const latlng = L.latLng(record.latitude, record.longitude);

    // Point already visible — don't disturb the map view (e.g. spiderfied cluster)
    if (map.getBounds().contains(latlng)) return;

    // Point is off-screen: pan without zoom change if already zoomed in,
    // otherwise fly in (country-level zoom → street-level).
    const currentZoom = map.getZoom();
    if (currentZoom < 12) {
      map.flyTo(latlng, 15, { duration: 0.8 });
    } else {
      map.panTo(latlng, { animate: true, duration: 0.5 });
    }
  }, [selectedId, map]);

  return null;
}

// ─── Invalidate size on tab reveal ───────────────────────────────────────────
function InvalidateSizeOnShow({ isVisible }: { isVisible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [isVisible, map]);
  return null;
}

// ─── Floating doctor card ─────────────────────────────────────────────────────
// Pure React, rendered OUTSIDE <MapContainer> so Leaflet lifecycle cannot touch it.
function DoctorCard({
  record,
  onClose,
}: {
  record: DoctorRecord;
  onClose: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 w-full md:w-72 animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="font-bold text-slate-900 text-[15px] leading-snug pr-1">
          {record.doctorName || <span className="italic text-slate-400">Unnamed</span>}
        </p>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1.5 text-sm">
        {record.specialty && (
          <p className="flex items-center gap-1.5 text-blue-600 font-medium">
            <Stethoscope className="w-3.5 h-3.5 flex-shrink-0" />
            {record.specialty}
          </p>
        )}

        {record.clinic && (
          <p className="flex items-start gap-1.5 text-slate-600">
            <Building2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{record.clinic}</span>
          </p>
        )}

        <p className="flex items-start gap-1.5 text-slate-500">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{record.fullAddress}</span>
        </p>

        {record.phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            <a href={`tel:${record.phone}`} className="text-blue-600 hover:underline">
              {record.phone}
            </a>
          </p>
        )}

        {record.schedule && (
          <p className="flex items-start gap-1.5 text-slate-500">
            <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
            <span>{record.schedule}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  records: DoctorRecord[];
  selectedId: string | null;
  onMarkerClick: (id: string) => void;
  onDeselect: () => void;
  isVisible?: boolean;
}

export default React.memo(function MapView({
  records,
  selectedId,
  onMarkerClick,
  onDeselect,
  isVisible = true,
}: Props) {
  const geocoded = records.filter(
    (r) => r.geocodingStatus === "geocoded" && r.latitude != null && r.longitude != null
  );

  const selectedRecord = selectedId
    ? records.find((r) => r.id === selectedId) ?? null
    : null;

  const center: [number, number] =
    geocoded.length > 0
      ? [geocoded[0].latitude!, geocoded[0].longitude!]
      : [45.9432, 24.9668];

  // ── Keep spider open when clicking a child marker ─────────────────────────
  //
  // How Leaflet.markercluster closes the spider:
  //   spiderfy()  → group.on('click animatestart', _unspiderfy)
  //   child click → _propagateEvent fires 'click' on group → _unspiderfy → collapses
  //
  // Why the timestamp approach DOES NOT work:
  //   _propagateEvent is bound to the marker when it is ADDED to the cluster
  //   (via _bindMarker / addLayer). react-leaflet binds our eventHandlers.click
  //   AFTER addLayer. So _propagateEvent always fires before our handler can
  //   stamp the time, and the timestamp check is always stale.
  //
  // Reliable fix — check e.type:
  //   • 'click'        → always a child-marker propagation (suppress → spider stays)
  //   • 'clusterclick' → cluster click, handled by _zoomOrSpiderfy (never reaches here)
  //   • 'animatestart' → zoom starts (allow → spider closes on zoom ✓)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterGroupRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mcg = clusterGroupRef.current as any;
    if (!mcg || typeof mcg._unspiderfy !== "function") return;

    const original = mcg._unspiderfy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mcg._unspiderfy = function (this: any, e: any) {
      // Child-marker propagation → keep spider open so the user can
      // click multiple doctors in the same cluster without it collapsing.
      if (e?.type === "click") return;
      // Zoom (animatestart) and everything else → collapse normally
      original.call(this, e);
    };

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = clusterGroupRef.current as any;
      if (m) delete m._unspiderfy;
    };
  }, []);

  const handleMarkerClick = useCallback(
    (id: string) => onMarkerClick(id),
    [onMarkerClick]
  );

  // ── Card position above the selected pin ──────────────────────────────────
  // cardPos is the container-pixel position of the pin TIP (lat/lng anchor).
  // The card is rendered with transform: translate(-50%, -100%) so its bottom
  // edge aligns just above the icon top (tip − iconHeight − gap).
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null);
  const handlePositionUpdate = useCallback(
    (pos: { x: number; y: number } | null) => setCardPos(pos),
    []
  );

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={center}
        zoom={geocoded.length > 0 ? 7 : 6}
        style={{ height: "100%", width: "100%", maxHeight: "100%", maxWidth: "100%" }}
        scrollWheelZoom
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} crossOrigin="anonymous" />
        <FlyToSelected records={records} selectedId={selectedId} />
        <InvalidateSizeOnShow isVisible={isVisible} />
        <CardPositionTracker
          selectedRecord={selectedRecord}
          onPositionUpdate={handlePositionUpdate}
        />

        <MarkerClusterGroup
          ref={clusterGroupRef}
          chunkedLoading
          showCoverageOnHover={false}
        >
          {geocoded.map((record) => (
            <Marker
              key={record.id}
              position={[record.latitude!, record.longitude!]}
              icon={selectedId === record.id ? SELECTED_ICON : DEFAULT_ICON}
              eventHandlers={{ click: () => handleMarkerClick(record.id) }}
            />
          ))}
        </MarkerClusterGroup>

        {geocoded.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none">
            <div className="bg-white rounded-xl shadow-lg px-6 py-4 text-center pointer-events-auto">
              <p className="text-slate-600 font-medium">No geocoded locations to display</p>
              <p className="text-slate-400 text-sm mt-1">Run geocoding to see markers on the map</p>
            </div>
          </div>
        )}
      </MapContainer>

      {/* Mobile: full-width card anchored to bottom of map */}
      {selectedRecord && selectedRecord.geocodingStatus === "geocoded" && (
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] p-3 pointer-events-auto">
          <DoctorCard record={selectedRecord} onClose={onDeselect} />
        </div>
      )}

      {/* Desktop: card above the selected pin (tracked to map coordinates) */}
      {selectedRecord && selectedRecord.geocodingStatus === "geocoded" && cardPos && (
        <div
          className="hidden md:block absolute z-[1000] pointer-events-auto"
          style={{
            left: `${cardPos.x}px`,
            top:  `${cardPos.y - ICON_HEIGHT_PX - CARD_GAP_PX}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <DoctorCard record={selectedRecord} onClose={onDeselect} />
        </div>
      )}
    </div>
  );
});
