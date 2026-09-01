import { MODEL_LARGE, MODEL_SMALL } from "./gemini";
import logger from "./logger";

// The free tier's real binding constraint is a hard REQUEST COUNT per day,
// not a token budget — confirmed live via an actual 429 while MODEL_LARGE
// was still gemini-3.5-flash (quotaId GenerateRequestsPerDayPerProjectPer
// Model-FreeTier, quotaValue "20"). Google no longer publishes fixed numbers
// on ai.google.dev, and cut free-tier Flash quotas heavily in Dec 2025; check
// https://aistudio.google.com/rate-limit for this account's live figures.
//
// MODEL_LARGE moved to gemini-2.5-flash (2026-09-01, see gemini.js), an
// established GA model whose free-tier RPD is expected to be well above the
// preview-tier 20/day gemini-3.5-flash hit — but that's an unconfirmed
// estimate from third-party trackers, not a live-confirmed number like the
// 20 above, so this stays conservative rather than assuming the full
// improvement. Update this once a real 429 (or the AI Studio dashboard)
// gives an actual figure for the current model.
export const DAILY_REQUEST_LIMIT = {
  [MODEL_LARGE]: 100,
  [MODEL_SMALL]: 20,
};

const CURRENT_TRIP_KEY = "abhi-trip-current";
const TRIP_HISTORY_KEY = "abhi-trip-history";

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    logger.error(`Failed to read stored data for ${key}:`, err);
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.error(`Failed to write stored data for ${key}:`, err);
  }
}

export function cacheCurrentTrip(trip) {
  writeStoredJson(CURRENT_TRIP_KEY, trip);
}

export function loadCachedTrip() {
  return readStoredJson(CURRENT_TRIP_KEY, null);
}

export function clearCachedTrip() {
  try {
    localStorage.removeItem(CURRENT_TRIP_KEY);
  } catch (err) {
    logger.error("Failed to clear cached trip:", err);
  }
}

export function getTripHistory() {
  const history = readStoredJson(TRIP_HISTORY_KEY, []);
  return Array.isArray(history) ? history : [];
}

export function addTripToHistory(trip) {
  if (!trip?.id) return;

  const history = getTripHistory().filter((savedTrip) => savedTrip.id !== trip.id);
  writeStoredJson(TRIP_HISTORY_KEY, [trip, ...history]);
}

export function removeTripFromHistory(tripId) {
  writeStoredJson(
    TRIP_HISTORY_KEY,
    getTripHistory().filter((trip) => trip.id !== tripId)
  );
}
