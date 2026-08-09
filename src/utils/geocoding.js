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
        const label = city && country ? `${city}, ${country}` : place.display_name;

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

export default { searchPlaces };