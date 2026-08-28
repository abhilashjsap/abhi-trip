import logger from "./logger";

// Frankfurter (https://frankfurter.dev) — free, keyless, no rate limit
// beyond generic abuse protection. Confirmed CORS-safe for direct browser
// calls (unlike Gemini/Cerebras — see gemini.js for that story).
//
// Coverage is narrower than it first looks: the /latest endpoint only
// covers ~30 major currencies (the ECB reference set), not the "201
// currencies" the docs advertise for historical/dataset access. Common
// destination currencies like VND or AED aren't included, so this is a
// best-effort upgrade over the AI's guess, not a guaranteed replacement —
// callers should keep the AI's estimate as a fallback when this returns null.
const BASE_URL = "https://api.frankfurter.dev/v1/latest";
const TIMEOUT_MS = 4000;

/**
 * Fetches how many units of `targetCode` equal 1 unit of `baseCode`.
 * Returns null (never throws) if either currency isn't covered, the
 * request fails, or it times out — trip generation should never be
 * blocked or degraded by this being unavailable.
 */
export async function getExchangeRate(baseCode, targetCode) {
  if (!baseCode || !targetCode || baseCode === targetCode) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${BASE_URL}?base=${encodeURIComponent(baseCode)}&symbols=${encodeURIComponent(targetCode)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = await res.json();
    const rate = data?.rates?.[targetCode];
    return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
  } catch (err) {
    logger.debug("Live exchange rate lookup failed, falling back to AI estimate:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
