import { MODEL_LARGE, MODEL_SMALL, MODEL_FALLBACK } from "./gemini";
import logger from "./logger";

// The free tier's real binding constraint is a hard REQUEST COUNT per day,
// not a token budget — confirmed live via an actual 429 while MODEL_LARGE
// was still gemini-3.5-flash (quotaId GenerateRequestsPerDayPerProjectPer
// Model-FreeTier, quotaValue "20"), and reconfirmed again for the current
// MODEL_LARGE (gemini-3.6-flash) — still exactly 20. Google no longer
// publishes fixed numbers on ai.google.dev; check
// https://aistudio.google.com/rate-limit for this account's live figures.
//
// MODEL_FALLBACK (gemini-2.5-flash-lite) has never actually been used live
// in this app — its real quota is completely unconfirmed. Deliberately NOT
// guessing upward from third-party estimates here (that's exactly how the
// old "213 trips left" bug happened) — it stays at the same conservative
// 20 until a real 429 (or the AI Studio dashboard) gives an actual number.
export const DAILY_REQUEST_LIMIT = {
  [MODEL_LARGE]: 20,
  [MODEL_SMALL]: 20,
  [MODEL_FALLBACK]: 20,
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
