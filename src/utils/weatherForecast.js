import { geocodeDestination } from "./geocoding";
import logger from "./logger";

// Open-Meteo: free, keyless, no signup, generous rate limits for
// non-commercial use — confirmed live. Gives a real short-range forecast to
// sit alongside the AI's historical monthly averages (which are honestly
// disclaimed as "not a live forecast").
const FORECAST_DAYS = 7;

// Open-Meteo's free forecast model covers roughly the next 16 days from
// today (0-indexed: today+15 is the last day it can return). A departure
// date beyond that simply has no live forecast yet — there's nothing to
// fall back to, it just isn't in range.
const MAX_HORIZON_DAYS = 15;

function toUtcMidnight(dateStr) {
  // Parsed as UTC so "days until" isn't off by one depending on the
  // browser's local timezone relative to the plain YYYY-MM-DD form value.
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function todayUtcMidnight() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function daysUntil(dateStr) {
  return Math.round((toUtcMidnight(dateStr) - todayUtcMidnight()) / 86400000);
}

/**
 * Whether a departure date falls within Open-Meteo's forecast horizon (and
 * isn't in the past). Weather.jsx uses this to decide between fetching a
 * live forecast, showing a "not available yet" note, or showing nothing.
 * @param {string} departureDate - "YYYY-MM-DD"
 */
export function isWithinForecastHorizon(departureDate) {
  if (!departureDate) return true; // no date given -> the "today onward" default always applies
  const diff = daysUntil(departureDate);
  return diff >= 0 && diff <= MAX_HORIZON_DAYS;
}

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

function isoDate(utcMillis) {
  return new Date(utcMillis).toISOString().slice(0, 10);
}

/**
 * Fetches a real short-range forecast for a destination. With no
 * departureDate (or one outside the forecast horizon/in the past), this is
 * a plain "next 7 days from today" strip. With a departureDate inside the
 * horizon, the window shifts to start at the departure date instead, so the
 * forecast actually lines up with the trip rather than always showing today.
 *
 * Never throws — returns null on any failure (can't geocode the
 * destination, network error, malformed response, date beyond the horizon)
 * so a missing forecast degrades to just not showing the section, same
 * pattern as the FX rate and attraction map pins.
 * @param {string} destination
 * @param {string} [departureDate] - "YYYY-MM-DD", optional
 * @returns {Promise<Array<{date: string, maxC: number, minC: number, precipProbability: number, condition: string}> | null>}
 */
export async function getLiveForecast(destination, departureDate) {
  if (!destination) return null;
  if (departureDate && !isWithinForecastHorizon(departureDate)) return null;

  const coords = await geocodeDestination(destination);
  if (!coords) return null;

  let rangeParams;
  if (departureDate) {
    const startMillis = Math.max(toUtcMidnight(departureDate), todayUtcMidnight());
    const lastPossible = todayUtcMidnight() + MAX_HORIZON_DAYS * 86400000;
    const endMillis = Math.min(startMillis + (FORECAST_DAYS - 1) * 86400000, lastPossible);
    rangeParams = `start_date=${isoDate(startMillis)}&end_date=${isoDate(endMillis)}`;
  } else {
    rangeParams = `forecast_days=${FORECAST_DAYS}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
        `&timezone=auto&${rangeParams}`,
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
