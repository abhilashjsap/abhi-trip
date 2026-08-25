import { MODEL_LARGE, MODEL_SMALL } from "./gemini";
import logger from "./logger";

// Google no longer publishes fixed per-model free-tier numbers on
// ai.google.dev — check https://aistudio.google.com/rate-limit for this
// account's actual live limits. These are rough placeholders (roughly
// requests/day x tokens/call) just to keep the "trips left today" meter
// in the right ballpark rather than exact.
export const DAILY_TOKEN_BUDGET = {
  [MODEL_LARGE]: 2000000,
  [MODEL_SMALL]: 1000000,
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
