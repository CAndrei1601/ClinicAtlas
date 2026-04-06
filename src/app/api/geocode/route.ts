import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

const CACHE_PATH = process.env.GEOCODING_CACHE_PATH || "./geocoding-cache.json";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "clinic-atlas/1.0";

// Romania bounding box — discard results outside this area
const ROMANIA = { latMin: 43.5, latMax: 48.3, lngMin: 20.2, lngMax: 30.0 };

type CacheEntry = {
  latitude: number;
  longitude: number;
  displayName: string;
  cachedAt: string;
};
type Cache = Record<string, CacheEntry>;

// ─── Cache helpers ────────────────────────────────────────────────────────────

function loadCache(): Cache {
  try {
    if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  } catch { /* ignore */ }
  return {};
}

function saveCache(cache: Cache): void {
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); } catch { /* ignore */ }
}

function isInsideRomania(lat: number, lng: number): boolean {
  return (
    lat >= ROMANIA.latMin && lat <= ROMANIA.latMax &&
    lng >= ROMANIA.lngMin && lng <= ROMANIA.lngMax
  );
}

// ─── Nominatim helpers ────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Title-case a string: "CLUJ NAPOCA" → "Cluj Napoca", "CLUJ-NAPOCA" → "Cluj-Napoca".
 * Uses (^|[\s-]) instead of \b to avoid mis-capitalising after Romanian diacritics
 * (ș, ț, ă, î, â) which are not ASCII word characters and cause \b to treat
 * the following letter as a word start (e.g. "BucureșTi").
 */
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Remove the "Nr." / "NR." token from a street string so Nominatim can parse
 * the house number cleanly: "Strada Clinicilor Nr. 1" → "Strada Clinicilor 1"
 */
function cleanStreet(street: string): string {
  return street.replace(/\bNr\.\s*/gi, "").replace(/\s+/g, " ").trim();
}

/**
 * Romanian street type prefixes.
 * When the prefix in the data ("Strada") doesn't match OSM ("Calea"),
 * Nominatim returns nothing. Stripping the prefix and searching just
 * the name lets Nominatim match regardless of the type word used.
 *
 * Examples:
 *   "Strada Dorobantilor"  → "Dorobantilor"
 *   "B-dul Unirii"         → "Unirii"
 *   "Șos. Kiseleff"        → "Kiseleff"
 */
const STREET_TYPE_PATTERN = /^(?:strada|str\.?|calea|cal\.?|bulevardul|bd\.?|b-dul|blvd\.?|aleea|al\.?|pia[tț]a|p-[tț]a|p[tț]a\.?|intrarea|intr\.?|fund[aă]tura|[sș]oseaua|[sș]os\.?|splaiul|splaiurile|pasajul|pas\.?)\s+/iu;

function stripStreetType(street: string): string {
  const stripped = street.trim().replace(STREET_TYPE_PATTERN, "").trim();
  // Don't return an empty string or just a number
  return stripped.length > 2 ? stripped : street;
}

async function nominatimFetch(params: URLSearchParams): Promise<CacheEntry | null> {
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;

  const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);

  // Reject results that land outside Romania — they are almost always wrong
  if (!isInsideRomania(lat, lng)) return null;

  return {
    latitude: lat,
    longitude: lng,
    displayName: first.display_name,
    cachedAt: new Date().toISOString(),
  };
}

/**
 * Geocode an address using a four-strategy waterfall:
 *
 *  1. Structured  (street + city + county)  — most precise
 *  2. Structured  (street + city)           — drop county if it causes a mismatch
 *  3. Structured  (name-only + city)        — strip Romanian street-type prefix
 *     ("Strada X" fails but "X" matches "Calea X", "Bulevardul X", etc. in OSM)
 *  4. Free-text   (fullAddress)             — last resort, still restricted to Romania
 *
 * A 1.1 s delay is inserted between attempts to respect Nominatim's 1 req/s rate limit.
 */
async function geocodeWithFallback(fields: {
  address: string;   // full address string (strategy 3 & cache key)
  street?: string;
  city?: string;
  county?: string;
}): Promise<CacheEntry | null> {
  const base = { format: "json", limit: "1", addressdetails: "0", countrycodes: "ro" };

  const strategies: URLSearchParams[] = [];

  // Strategy 1 — structured: street + city + county (most precise)
  if (fields.street && fields.city && fields.county) {
    const p = new URLSearchParams(base);
    p.set("street", cleanStreet(fields.street));
    p.set("city", toTitleCase(fields.city));
    p.set("county", toTitleCase(fields.county));
    strategies.push(p);
  }

  // Strategy 2 — structured: street + city only (no county)
  if (fields.street && fields.city) {
    const p = new URLSearchParams(base);
    p.set("street", cleanStreet(fields.street));
    p.set("city", toTitleCase(fields.city));
    strategies.push(p);
  }

  // Strategy 3 — structured: street name WITHOUT type prefix + city
  // Handles cases where the data says "Strada X" but OSM has "Calea X" or "Bulevardul X".
  if (fields.street && fields.city) {
    const nameOnly = stripStreetType(cleanStreet(fields.street));
    const cleaned  = cleanStreet(fields.street);
    // Only add this strategy if stripping actually changed the street string
    if (nameOnly !== cleaned) {
      const p = new URLSearchParams(base);
      p.set("street", nameOnly);
      p.set("city", toTitleCase(fields.city));
      strategies.push(p);
    }
  }

  // Strategy 4 — free-text, restricted to Romania
  if (fields.address) {
    const p = new URLSearchParams({ ...base, q: fields.address });
    strategies.push(p);
  }

  for (let i = 0; i < strategies.length; i++) {
    if (i > 0) await sleep(1100); // rate-limit between fallback attempts
    const result = await nominatimFetch(strategies[i]);
    if (result) return result;
  }

  return null;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      address?: string;
      street?: string;
      city?: string;
      county?: string;
    };

    const { address, street, city, county } = body;

    if (!address || typeof address !== "string" || !address.trim()) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const cacheKey = address.trim();
    const cache = loadCache();

    // Return cached result if it exists and is inside Romania
    if (cache[cacheKey]) {
      const { latitude, longitude, displayName } = cache[cacheKey];
      if (isInsideRomania(latitude, longitude)) {
        return NextResponse.json({ latitude, longitude, displayName, cached: true });
      }
      // Bad cached entry — delete and re-geocode
      delete cache[cacheKey];
      saveCache(cache);
    }

    const result = await geocodeWithFallback({ address: cacheKey, street, city, county });

    if (!result) {
      return NextResponse.json(
        { error: "Address not found", latitude: null, longitude: null },
        { status: 404 }
      );
    }

    cache[cacheKey] = result;
    saveCache(cache);

    return NextResponse.json({
      latitude: result.latitude,
      longitude: result.longitude,
      displayName: result.displayName,
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/geocode — clears the entire geocoding cache */
export async function DELETE() {
  try {
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
    return NextResponse.json({ ok: true, message: "Cache cleared" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
