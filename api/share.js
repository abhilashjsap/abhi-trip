import { Redis } from "@upstash/redis";

// Server-side only, same reasoning as GEMINI_API_KEY in api/gemini.js: never
// VITE_-prefixed, so it's never bundled into client JS.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const KEY_PREFIX = "share:";
// Bounds storage growth on Upstash's free tier (256MB) as shares
// accumulate over time — a shared trip is a point-in-time snapshot anyway,
// not something that needs to live forever.
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

function generateId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export default {
  async fetch(request) {
    if (!redis) {
      return Response.json(
        { error: "Server is missing Upstash Redis configuration." },
        { status: 500 }
      );
    }

    const url = new URL(request.url);

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body." }, { status: 400 });
      }

      const trip = body?.trip;
      if (!trip) {
        return Response.json({ error: "Missing trip data." }, { status: 400 });
      }

      const id = generateId();
      try {
        await redis.set(`${KEY_PREFIX}${id}`, JSON.stringify(trip), {
          ex: TTL_SECONDS,
        });
      } catch (err) {
        return Response.json(
          { error: err?.message || "Couldn't create the share link. Please try again." },
          { status: 500 }
        );
      }

      return Response.json({ id });
    }

    if (request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) {
        return Response.json({ error: "Missing id." }, { status: 400 });
      }

      let raw;
      try {
        raw = await redis.get(`${KEY_PREFIX}${id}`);
      } catch (err) {
        return Response.json(
          { error: err?.message || "Couldn't load the shared trip." },
          { status: 500 }
        );
      }

      if (!raw) {
        return Response.json(
          { error: "This link has expired or doesn't exist." },
          { status: 404 }
        );
      }

      let trip;
      try {
        // Defensive: store as a JSON string explicitly rather than relying
        // on the client's own (undocumented, version-dependent) object
        // serialization, so this works the same regardless of what get()
        // hands back.
        trip = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return Response.json({ error: "Couldn't load the shared trip." }, { status: 500 });
      }

      return Response.json({ trip });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  },
};
