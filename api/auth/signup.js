import { redis } from "../../lib/redis.js";
import { hashPassword } from "../../lib/passwordHash.js";
import { createSessionToken } from "../../lib/authToken.js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const KEY_PREFIX = "user:";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    if (!redis) {
      return Response.json(
        { error: "Server is missing Upstash Redis configuration." },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const username = (body?.username || "").trim();
    const password = body?.password || "";

    if (!USERNAME_RE.test(username)) {
      return Response.json(
        { error: "Username must be 3-20 characters: letters, numbers, underscores only." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const key = `${KEY_PREFIX}${username.toLowerCase()}`;

    try {
      const passwordHash = await hashPassword(password);
      const record = JSON.stringify({ username, passwordHash, createdAt: new Date().toISOString() });

      // Atomic set-if-not-exists — avoids a check-then-set race between two
      // signups for the same username landing at the same time (plain
      // get-then-set couldn't guarantee that).
      const created = await redis.set(key, record, { nx: true });
      if (created === null) {
        return Response.json({ error: "That username is already taken." }, { status: 409 });
      }

      const token = createSessionToken(username);
      return Response.json({ token, username });
    } catch (err) {
      return Response.json(
        { error: err?.message || "Couldn't create account. Please try again." },
        { status: 500 }
      );
    }
  },
};
