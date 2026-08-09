import logger from "./logger";

const ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
const BASE_URL = "https://api.unsplash.com";

/**
 * Searches Unsplash for photos matching a query.
 * @param {string} query
 * @param {number} count - number of results to fetch
 * @returns {Promise<Array<{url: string, thumb: string, alt: string, credit: {name: string, link: string}}>>}
 */
export async function searchPhotos(query, count = 1) {
  if (!ACCESS_KEY) {
    logger.warn("VITE_UNSPLASH_ACCESS_KEY missing — falling back to placeholder images.");
    return [];
  }

  try {
    const res = await fetch(
      `${BASE_URL}/search/photos?query=${encodeURIComponent(
        query
      )}&per_page=${count}&orientation=landscape`,
      {
        headers: {
          Authorization: `Client-ID ${ACCESS_KEY}`,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Unsplash API error: ${res.status}`);
    }

    const data = await res.json();

    return (data.results || []).map((photo) => ({
      url: photo.urls.regular,
      thumb: photo.urls.small,
      full: photo.urls.full,
      alt: photo.alt_description || query,
      credit: {
        name: photo.user.name,
        link: photo.user.links.html,
      },
    }));
  } catch (err) {
    logger.error("Unsplash fetch failed:", err);
    return [];
  }
}

/**
 * Fetches one hero image for a destination. Some destinations (smaller
 * cities, or country-only searches) don't have good matches for a narrow
 * "landmark skyline" query and would silently return nothing — so we try a
 * few progressively looser queries until one actually returns a result.
 */
export async function getDestinationHero(destination) {
  const queries = [
    `${destination} landmark skyline`,
    `${destination} travel`,
    `${destination} city`,
    `${destination}`,
  ];

  for (const query of queries) {
    const results = await searchPhotos(query, 1);
    if (results[0]) return results[0];
  }

  return null;
}

/**
 * Fetches one image per attraction name, in parallel. Falls back to a
 * looser destination-only query if the specific attraction name+destination
 * search comes up empty (common for lesser-known or small-city spots).
 */
export async function getAttractionImages(attractionNames, destination) {
  const results = await Promise.all(
    attractionNames.map(async (name) => {
      const specific = await searchPhotos(`${name} ${destination}`, 1);
      if (specific[0]) return specific[0];

      const fallback = await searchPhotos(`${destination} travel`, 1);
      return fallback[0] || null;
    })
  );
  return results;
}

export default { searchPhotos, getDestinationHero, getAttractionImages };