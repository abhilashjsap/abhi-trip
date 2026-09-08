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

/**
 * Trips generated before the multi-destination feature have no
 * `destinations` array — everything (attractions, weather, food, shopping,
 * currencyInfo, bewareOf, emergencyInfo, visaInfo, simInfo, phrasebook,
 * bookInAdvance) sits flat at the top level of the trip object, for one
 * implicit destination (`trip.input.destination`). Normalizing old trips
 * into the new `{destinations, perDestination}` shape on load means
 * TripResult.jsx and TripPdfDocument.js only ever need to handle one shape.
 * A no-op (returns the trip as-is) for anything already new-shape or falsy.
 */
export function normalizeTripShape(trip) {
  if (!trip || trip.destinations) return trip;

  const destinationName = trip.input?.destination;

  return {
    ...trip,
    destinations: [{ name: destinationName, days: trip.input?.days }],
    perDestination: [
      {
        destination: destinationName,
        attractions: trip.attractions || [],
        weather: trip.weather || null,
        food: trip.food || null,
        shopping: trip.shopping || [],
        currencyInfo: trip.currencyInfo || null,
        bewareOf: trip.bewareOf || null,
        emergencyInfo: trip.emergencyInfo || null,
        visaInfo: trip.visaInfo || null,
        simInfo: trip.simInfo || null,
        phrasebook: trip.phrasebook || null,
        bookInAdvance: trip.bookInAdvance || null,
      },
    ],
    // Old itinerary days have no `destination` field — backfill it since
    // there's only ever been one destination for an old trip.
    itinerary: (trip.itinerary || []).map((day) => ({
      ...day,
      destination: day.destination || destinationName,
    })),
  };
}

export function cacheCurrentTrip(trip) {
  writeStoredJson(CURRENT_TRIP_KEY, trip);
}

export function loadCachedTrip() {
  return normalizeTripShape(readStoredJson(CURRENT_TRIP_KEY, null));
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
  return Array.isArray(history) ? history.map(normalizeTripShape) : [];
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
