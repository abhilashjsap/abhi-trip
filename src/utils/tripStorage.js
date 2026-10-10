import { MODEL_LARGE, MODEL_SMALL, MODEL_FALLBACK } from "./gemini";
import { getAuthToken } from "./auth";
import logger from "./logger";

// The free tier's real binding constraint is a hard REQUEST COUNT per day,
// not a token budget — confirmed live via an actual 429 while MODEL_LARGE
// was still gemini-3.5-flash (quotaId GenerateRequestsPerDayPerProjectPer
// Model-FreeTier, quotaValue "20"), and reconfirmed again for the current
// MODEL_LARGE (gemini-3.6-flash) — still exactly 20. Google no longer
// publishes fixed numbers on ai.google.dev; check
// https://aistudio.google.com/rate-limit for this account's live figures.
//
// MODEL_FALLBACK (currently gemini-3.5-flash — see gemini.js, the previous
// gemini-2.5-flash-lite choice 404'd live) has never actually completed a
// real generation in this app — its quota is completely unconfirmed.
// Deliberately NOT guessing upward from third-party estimates here (that's
// exactly how the old "213 trips left" bug happened) — it stays at the
// same conservative 20 until a real 429 (or the AI Studio dashboard) gives
// an actual number.
export const DAILY_REQUEST_LIMIT = {
  [MODEL_LARGE]: 20,
  [MODEL_SMALL]: 20,
  [MODEL_FALLBACK]: 20,
};

// Trip storage lives server-side (Redis, keyed by username — see
// api/trips.js), NOT in localStorage. It used to be one fixed localStorage
// key regardless of who was signed in, which meant two accounts on the
// same browser saw each other's trips, and the same account on two
// different browsers saw two unrelated histories — neither is what anyone
// signing into a real account would expect.
async function authFetch(path, options = {}) {
  const token = getAuthToken();
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error("Couldn't reach the server. Please check your connection and try again.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Something went wrong. Please try again.");
  }
  return data;
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
        accommodation: trip.accommodation || null,
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

/**
 * Fetches the signed-in user's full trip list plus which trip (if any) is
 * "current" (the one to restore on reload). Never throws — a failed fetch
 * (signed out, network error, server error) just comes back as an empty
 * list, same "degrade gracefully" pattern as the rest of this app's
 * best-effort fetches (live FX rate, hero image, etc.).
 * @returns {Promise<{trips: Object[], currentTripId: string|null}>}
 */
export async function fetchTrips() {
  try {
    const data = await authFetch("/api/trips", { method: "GET" });
    return {
      trips: (data.trips || []).map(normalizeTripShape),
      currentTripId: data.currentTripId || null,
    };
  } catch (err) {
    logger.error("Failed to fetch trips:", err);
    return { trips: [], currentTripId: null };
  }
}

/**
 * Upserts a trip into the signed-in user's history (deduped by id, most
 * recent first) and marks it as the "current" trip to restore on reload —
 * the server-backed equivalent of the old cacheCurrentTrip+addTripToHistory
 * pair, which were always called together anyway.
 */
export async function saveTrip(trip) {
  if (!trip?.id) return;
  try {
    await authFetch("/api/trips", {
      method: "POST",
      body: JSON.stringify({ action: "save", trip }),
    });
  } catch (err) {
    logger.error("Failed to save trip:", err);
  }
}

/** Marks an already-saved trip (picked from history) as "current", without re-saving it. */
export async function setCurrentTripId(tripId) {
  try {
    await authFetch("/api/trips", {
      method: "POST",
      body: JSON.stringify({ action: "setCurrent", tripId }),
    });
  } catch (err) {
    logger.error("Failed to set current trip:", err);
  }
}

/** Forgets which trip is "current" (e.g. "Plan another") without deleting it from history. */
export async function clearCurrentTrip() {
  try {
    await authFetch("/api/trips", {
      method: "POST",
      body: JSON.stringify({ action: "clearCurrent" }),
    });
  } catch (err) {
    logger.error("Failed to clear current trip:", err);
  }
}

export async function removeTripFromHistory(tripId) {
  await authFetch("/api/trips", {
    method: "POST",
    body: JSON.stringify({ action: "remove", tripId }),
  });
}
