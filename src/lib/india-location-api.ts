/**
 * India states/cities, sourced dynamically from the india-pincode-api
 * (https://aniket-thapa.github.io/india-pincode-api) instead of a static
 * local dataset. Used by /api/location/states and /api/location/cities.
 *
 * The upstream API returns ALL-CAPS names and a slug per entry (e.g.
 * "TAMIL NADU" / "tamil-nadu"); we normalize to Title Case for display and
 * storage so saved profile data ("Tamil Nadu") keeps matching dropdown
 * options across reloads.
 */

const API_BASE = (process.env.INDIA_LOCATION_API_URL || "https://aniket-thapa.github.io/india-pincode-api").replace(/\/$/, "");

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 8000;

// A handful of connector words that India Post keeps lowercase in official
// state names, e.g. "Jammu and Kashmir", "Dadra and Nagar Haveli and Daman and Diu".
const LOWERCASE_WORDS = new Set(["and", "of"]);

function toTitleCase(raw: string): string {
  const words = raw.trim().toLowerCase().split(/\s+/);
  return words
    .map((word, i) => (i > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Some upstream state names carry a stray "The " prefix; drop it for display. */
function cleanStateName(raw: string): string {
  const title = toTitleCase(raw);
  return title.replace(/^The\s+/, "");
}

interface UpstreamState {
  name: string;
  slug: string;
}

interface UpstreamStateDetail {
  name: string;
  slug: string;
  districts: { name: string; slug: string }[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Location API request to ${path} failed with status ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

interface StatesCache {
  names: string[];
  slugByName: Map<string, string>;
  fetchedAt: number;
}

let statesCache: StatesCache | null = null;
let statesInflight: Promise<StatesCache> | null = null;

async function loadStates(): Promise<StatesCache> {
  if (statesCache && Date.now() - statesCache.fetchedAt < CACHE_TTL_MS) {
    return statesCache;
  }
  if (statesInflight) return statesInflight;

  statesInflight = (async () => {
    const raw = await fetchJson<UpstreamState[]>("/states.json");
    const slugByName = new Map<string, string>();

    for (const entry of raw) {
      // The upstream dataset includes a junk "NA" entry (unassigned postal
      // circle) that isn't a real state/UT — skip it.
      if (entry.name.trim().toUpperCase() === "NA") continue;
      slugByName.set(cleanStateName(entry.name), entry.slug);
    }

    const cache: StatesCache = {
      names: Array.from(slugByName.keys()).sort(),
      slugByName,
      fetchedAt: Date.now(),
    };
    statesCache = cache;
    return cache;
  })();

  try {
    return await statesInflight;
  } finally {
    statesInflight = null;
  }
}

interface CitiesCacheEntry {
  names: string[];
  fetchedAt: number;
}

const citiesCache = new Map<string, CitiesCacheEntry>();
const citiesInflight = new Map<string, Promise<CitiesCacheEntry>>();

async function loadCities(stateSlug: string): Promise<CitiesCacheEntry> {
  const cached = citiesCache.get(stateSlug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const inflight = citiesInflight.get(stateSlug);
  if (inflight) return inflight;

  const promise = (async () => {
    const detail = await fetchJson<UpstreamStateDetail>(`/states/${stateSlug}.json`);
    const names = Array.from(new Set(detail.districts.map((d) => toTitleCase(d.name)))).sort();
    const entry: CitiesCacheEntry = { names, fetchedAt: Date.now() };
    citiesCache.set(stateSlug, entry);
    return entry;
  })();

  citiesInflight.set(stateSlug, promise);
  try {
    return await promise;
  } finally {
    citiesInflight.delete(stateSlug);
  }
}

/** All Indian states / union territories, Title Case, sorted alphabetically. */
export async function getIndiaStates(): Promise<string[]> {
  const { names } = await loadStates();
  return names;
}

/**
 * Districts ("cities") for the given state name (Title Case, as returned by
 * getIndiaStates / saved on a profile). Returns [] for an unrecognized state
 * rather than throwing, since a user's saved value could predate a dataset
 * change.
 */
export async function getIndiaCities(stateName: string): Promise<string[]> {
  const { slugByName } = await loadStates();
  const slug = slugByName.get(stateName.trim());
  if (!slug) return [];

  const { names } = await loadCities(slug);
  return names;
}