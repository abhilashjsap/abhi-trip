import { redis } from "../lib/redis.js";
import { verifySessionToken } from "../lib/authToken.js";

// Per-account trip storage — replaces the old client-only localStorage
// cache, which used one fixed key regardless of who was signed in (so two
// accounts on the same browser saw each other's trips, and the same
// account on two different browsers saw two unrelated histories). Keyed
// by username so it actually follows the person, not the browser.
const TRIPS_KEY_PREFIX = "trips:";
const CURRENT_KEY_PREFIX = "currentTrip:";
// Bounds per-user storage growth on Upstash's free tier, same reasoning as
// the 90-day TTL on shared trips in api/share.js — most people only care
// about their recent trips anyway.
const MAX_TRIPS_PER_USER = 20;

function getUsernameFromRequest(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/i);
  const token = match ? match[1] : null;
  const payload = verifySessionToken(token);
  return payload?.username || null;
}

function parseJsonArray(raw) {
  if (!raw) return [];
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(parsed) ? parsed : [];
}

export default {
  async fetch(request) {
    if (!redis) {
      return Response.json(
        { error: "Server is missing Upstash Redis configuration." },
        { status: 500 }
      );
    }

    const username = getUsernameFromRequest(request);
    if (!username) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    const key = username.toLowerCase();
    const tripsKey = `${TRIPS_KEY_PREFIX}${key}`;
    const currentKey = `${CURRENT_KEY_PREFIX}${key}`;

    if (request.method === "GET") {
      try {
        const [rawTrips, currentTripId] = await Promise.all([
          redis.get(tripsKey),
          redis.get(currentKey),
        ]);
        return Response.json({ trips: parseJsonArray(rawTrips), currentTripId: currentTripId || null });
      } catch (err) {
        return Response.json({ error: err?.message || "Couldn't load your trips." }, { status: 500 });
      }
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body." }, { status: 400 });
      }

      try {
        switch (body?.action) {
          case "save": {
            const trip = body?.trip;
            if (!trip?.id) {
              return Response.json({ error: "Missing trip data." }, { status: 400 });
            }
            const existing = parseJsonArray(await redis.get(tripsKey));
            // Prepend-with-dedupe: a re-saved (edited/regenerated) trip
            // keeps its place conceptually "most recent" rather than
            // appearing twice.
            const next = [trip, ...existing.filter((t) => t.id !== trip.id)].slice(0, MAX_TRIPS_PER_USER);
            await Promise.all([
              redis.set(tripsKey, JSON.stringify(next)),
              redis.set(currentKey, trip.id),
            ]);
            return Response.json({ ok: true });
          }

          case "setCurrent": {
            const tripId = body?.tripId;
            if (!tripId) return Response.json({ error: "Missing tripId." }, { status: 400 });
            await redis.set(currentKey, tripId);
            return Response.json({ ok: true });
          }

          case "clearCurrent": {
            await redis.del(currentKey);
            return Response.json({ ok: true });
          }

          case "remove": {
            const tripId = body?.tripId;
            if (!tripId) return Response.json({ error: "Missing tripId." }, { status: 400 });
            const existing = parseJsonArray(await redis.get(tripsKey));
            const next = existing.filter((t) => t.id !== tripId);
            await redis.set(tripsKey, JSON.stringify(next));
            return Response.json({ ok: true });
          }

          default:
            return Response.json({ error: "Unknown action." }, { status: 400 });
        }
      } catch (err) {
        return Response.json({ error: err?.message || "Couldn't save your trip." }, { status: 500 });
      }
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  },
};
