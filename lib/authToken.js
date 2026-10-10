import crypto from "node:crypto";

// Server-side only secret for signing session tokens — set this in Vercel's
// env vars (and a local .env for dev) same as GEMINI_API_KEY/UPSTASH_*.
// Never VITE_-prefixed, so it's never bundled into client JS. Any long
// random string works, e.g. `openssl rand -hex 32`.
const SECRET = process.env.AUTH_SECRET;

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(payloadBase64) {
  return crypto.createHmac("sha256", SECRET).update(payloadBase64).digest("base64url");
}

/**
 * A minimal self-contained session token: base64url(JSON payload) + "." +
 * HMAC-SHA256 signature, verified with no database lookup. Deliberately
 * not a full JWT (no header, no alg-negotiation) — this app only ever
 * issues and verifies its own tokens with one fixed scheme, so the extra
 * surface a general JWT library brings (and the dependency itself) buys
 * nothing here.
 */
export function createSessionToken(username) {
  if (!SECRET) throw new Error("Server is missing AUTH_SECRET.");
  const payload = { username, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Verifies a token's signature BEFORE trusting anything in its payload
 * (never parse-then-check — an attacker-supplied payload must never reach
 * JSON.parse unless the signature over it already checked out). Returns
 * the payload ({username, exp}) if valid, or null if missing, malformed,
 * tampered, or expired.
 */
export function verifySessionToken(token) {
  if (!SECRET || !token) return null;

  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(body);
  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }

  if (!payload?.username || !payload?.exp || Date.now() > payload.exp) return null;
  return payload;
}
