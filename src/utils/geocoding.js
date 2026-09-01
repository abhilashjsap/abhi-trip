import logger from "./logger";

const BASE_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Searches OpenStreetMap's Nominatim geocoder for place suggestions.
 * Free, no API key required — but usage policy requires a descriptive
 * identifying param and reasonable request rates (we debounce calls in the
 * UI layer to stay well within their limits).
 *
 * @param {string} query
 * @returns {Promise<Array<{label: string, city: string, country: string}>>}
 */
export async function searchPlaces(query) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const res = await fetch(
      `${BASE_URL}?q=${encodeURIComponent(
        trimmed
      )}&format=jsonv2&addressdetails=1&limit=6&featuretype=city`,
      {
        headers: {
          // Nominatim's usage policy asks for a way to identify the app.
          "Accept-Language": "en",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.status}`);
    }

    const data = await res.json();

    return data
      .filter((place) => place.display_name)
      .map((place) => {
        const addr = place.address || {};
        const city =
          addr.city || addr.town || addr.village || addr.county || place.name;
        const country = addr.country;

        // A clean, short label for the dropdown — falls back to the full
        // display name if we can't confidently pull city/country apart.
        // Searching for a whole country (e.g. "Vietnam") gives Nominatim no
        // city/town/village/county component, so `city` falls back to
        // place.name — which for a country-level result IS the country name
        // — producing "Vietnam, Vietnam". That duplicated destination string
        // then flowed into every AI prompt for that trip, and multiple
        // trips built from country-only searches (Vietnam, South Korea)
        // went on to repeatedly hit the model's repetition-loop bug — very
        // plausibly the redundant phrasing biasing the decoder toward
        // repeating itself, not coincidence.
        const label =
          city && country
            ? city === country
              ? country
              : `${city}, ${country}`
            : place.display_name;

        return {
          label,
          city: city || place.name,
          country: country || "",
          raw: place.display_name,
        };
      })
      // De-dupe identical labels (Nominatim can return near-duplicates).
      .filter(
        (place, idx, arr) => arr.findIndex((p) => p.label === place.label) === idx
      );
  } catch (err) {
    logger.error("Nominatim search failed:", err);
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Looks up a single attraction's coordinates via Nominatim free-text search.
 * Returns null (never throws) on no match or any failure — a missing pin
 * shouldn't break the map for the rest of the trip.
 */
async function geocodeAttraction(name, destination) {
  const query = `${name}, ${destination}`;
  try {
    const res = await fetch(
      `${BASE_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const hit = data[0];
    if (!hit) return null;

    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch (err) {
    logger.debug(`Geocoding failed for "${query}":`, err);
    return null;
  }
}

/**
 * Geocodes a list of attractions one at a time (not in parallel) — unlike
 * Unsplash, Nominatim's usage policy caps free public use at ~1 request per
 * second, so a batch of 5-8 attractions takes a few seconds. Meant to run
 * client-side after the trip is already showing, not blocking generation.
 * @returns {Promise<Array<{lat: number, lng: number} | null>>} same order/length as input
 */
export async function geocodeAttractions(attractions, destination) {
  const results = [];
  for (const attraction of attractions) {
    results.push(await geocodeAttraction(attraction.name, destination));
    // Stay comfortably under Nominatim's ~1 req/sec policy.
    await sleep(1100);
  }
  return results;
}