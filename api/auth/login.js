import { redis } from "../../lib/redis.js";
import { hashPassword, verifyPassword } from "../../lib/passwordHash.js";
import { createSessionToken } from "../../lib/authToken.js";

const KEY_PREFIX = "user:";

// A real account's scrypt verification takes measurably longer than an
// immediate "no such user" response would — timing an attacker could use
// to enumerate valid usernames. Verifying against this fixed dummy hash on
// a miss costs the same scrypt work as a real check, so a nonexistent
// username and a wrong password take about the same time to reject.
let dummyHashPromise;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword("dummy-password-for-timing-only");
  return dummyHashPromise;
}

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
    if (!username || !password) {
      return Response.json({ error: "Enter a username and password." }, { status: 400 });
    }

    try {
      const raw = await redis.get(`${KEY_PREFIX}${username.toLowerCase()}`);
      const record = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;

      const ok = await verifyPassword(password, record ? record.passwordHash : await getDummyHash());
      if (!record || !ok) {
        return Response.json({ error: "Incorrect username or password." }, { status: 401 });
      }

      const token = createSessionToken(record.username);
      return Response.json({ token, username: record.username });
    } catch (err) {
      return Response.json(
        { error: err?.message || "Couldn't sign in. Please try again." },
        { status: 500 }
      );
    }
  },
};
