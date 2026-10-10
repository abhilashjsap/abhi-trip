import { Redis } from "@upstash/redis";

// Shared Upstash Redis client for every api/ route that needs persistence
// (trip sharing, user accounts) — was previously duplicated inline in
// api/share.js; pulled out once a second consumer (api/auth/*) needed the
// same client. Lives outside api/ so Vercel doesn't treat it as its own
// route.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
