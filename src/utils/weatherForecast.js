import { geocodeDestination } from "./geocoding";
import logger from "./logger";

// Open-Meteo: free, keyless, no signup, generous rate limits for
// non-commercial use — confirmed live. Gives a real short-range forecast to
// sit alongside the AI's historical monthly averages (which are honestly
// disclaimed as "not a live forecast" — this fills that gap for whoever's
// trip happens to be soon, without needing a travel-date field this app
// doesn't currently collect).
const FORECAST_DAYS = 7;

// WMO weather codes (used by Open-Meteo) collapsed into short human labels —
// https://open-meteo.com/en/docs lists the full table; this covers the
// common buckets rather than all ~30 codes individually.
function describeWeatherCode(code) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Mixed";
}

/**
 * Fetches a real short-range (next 7 days) forecast for a destination.
 * Never throws — returns null on any failure (can't geocode the
 * destination, network error, malformed response) so a missing forecast
 * degrades to just not showing the section, same pattern as the FX rate
 * and attraction map pins.
 * @param {string} destination
 * @returns {Promise<Array<{date: string, maxC: number, minC: number, precipProbability: number, condition: string}> | null>}
 */
export async function getLiveForecast(destination) {
  if (!destination) return null;

  const coords = await geocodeDestination(destination);
  if (!coords) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
        `&timezone=auto&forecast_days=${FORECAST_DAYS}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const { time, temperature_2m_max, temperature_2m_min, precipitation_probability_max, weathercode } =
      data.daily || {};

    if (!Array.isArray(time)) return null;

    return time.map((date, i) => ({
      date,
      maxC: Math.round(temperature_2m_max?.[i]),
      minC: Math.round(temperature_2m_min?.[i]),
      precipProbability: precipitation_probability_max?.[i] ?? null,
      condition: describeWeatherCode(weathercode?.[i]),
    }));
  } catch (err) {
    logger.debug(`Live forecast failed for "${destination}":`, err);
    return null;
  }
}
