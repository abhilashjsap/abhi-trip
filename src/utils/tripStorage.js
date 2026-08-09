import logger from "./logger";

const HISTORY_KEY = "abhitrip_trip_history";
const SESSION_TRIP_KEY = "abhitrip_current_trip";
const MAX_HISTORY = 20;

// Approximate daily token ceilings for each model's free-tier pool. Used
// only for the in-app usage indicator — Groq is the actual source of
// truth, this is a best-effort local estimate so the UI can warn before
// a request fails outright.
export const DAILY_TOKEN_BUDGET = {
  "llama-3.3-70b-versatile": 100000,
  "llama-3.1-8b-instant": 500000, // 8b's pool is request-capped (14,400 RPD) more than token-capped in practice
};

/**
 * Saves the current trip to sessionStorage so a reload doesn't lose it
 * (and doesn't burn tokens re-generating). Session-scoped intentionally —
 * closing the tab clears the "current" trip, while trip HISTORY (below)
 * persists across sessions in localStorage.
 */
export function cacheCurrentTrip(trip) {
  try {
    sessionStorage.setItem(SESSION_TRIP_KEY, JSON.stringify(trip));
  } catch (err) {
    logger.error("Failed to cache current trip:", err);
  }
}

export function loadCachedTrip() {
  try {
    const raw = sessionStorage.getItem(SESSION_TRIP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error("Failed to load cached trip:", err);
    return null;
  }
}

export function clearCachedTrip() {
  try {
    sessionStorage.removeItem(SESSION_TRIP_KEY);
  } catch {
    // Non-fatal — worst case a stale trip re-appears on next load.
  }
}

/**
 * Returns saved trip history, most recent first.
 */
export function getTripHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    logger.error("Failed to read trip history:", err);
    return [];
  }
}

/**
 * Adds a trip to history (most recent first), capped at MAX_HISTORY entries
 * to keep localStorage usage bounded — oldest entries are dropped silently.
 */
export function addTripToHistory(trip) {
  try {
    const history = getTripHistory();
    const next = [trip, ...history.filter((t) => t.id !== trip.id)].slice(
      0,
      MAX_HISTORY
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch (err) {
    logger.error("Failed to save trip to history:", err);
  }
}

export function removeTripFromHistory(tripId) {
  try {
    const history = getTripHistory().filter((t) => t.id !== tripId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    logger.error("Failed to remove trip from history:", err);
  }
}

export function clearTripHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Non-fatal.
  }
}

export default {
  cacheCurrentTrip,
  loadCachedTrip,
  clearCachedTrip,
  getTripHistory,
  addTripToHistory,
  removeTripFromHistory,
  clearTripHistory,
  DAILY_TOKEN_BUDGET,
};