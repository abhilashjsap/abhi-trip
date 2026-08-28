import logger from "./logger";

// Two separate models, each with its own free-tier quota. Mirrors the old
// Groq split: the big model handles the full plan (needs real quality),
// the small/lite one handles the cheap feasibility + budget-estimate JSON.
export const MODEL_LARGE = "gemini-3.5-flash";
export const MODEL_SMALL = "gemini-3.5-flash-lite";

const USAGE_STORAGE_KEY = "abhitrip_usage_log";

/**
 * Reads today's recorded token usage per model from localStorage. Usage
 * entries are date-stamped so a new day always starts fresh — this mirrors
 * the free tier's own daily reset, giving the UI an honest (if approximate)
 * picture of remaining daily quota without calling a billing API.
 */
export function getTodayUsage() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.date === today) return parsed.usage;
  } catch {
    // Corrupted or inaccessible storage — fall through to a fresh start.
  }
  return { [MODEL_LARGE]: 0, [MODEL_SMALL]: 0 };
}

function recordUsage(model, totalTokens) {
  if (!totalTokens) return;
  const today = new Date().toISOString().slice(0, 10);
  const usage = getTodayUsage();
  usage[model] = (usage[model] || 0) + totalTokens;
  try {
    localStorage.setItem(
      USAGE_STORAGE_KEY,
      JSON.stringify({ date: today, usage })
    );
  } catch {
    // Storage full or unavailable — usage tracking is best-effort only.
  }
}

/**
 * Thrown when Gemini's free-tier rate limit (requests/tokens per minute or
 * per day) is hit. Carries a retry-after hint (in seconds) when one is
 * available so the UI can show a genuinely useful wait time.
 */
export class RateLimitError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds || null;
  }
}

/**
 * Classifies whether an error is worth retrying. Only transient issues
 * (network blips, 5xx server errors, timeouts) qualify — rate limits (429)
 * and auth failures (401/403) never do, since retrying those either wastes
 * quota or can never succeed.
 */
function isRetryableError(status) {
  if (status === 429 || status === 401 || status === 403) return false;
  // 503 is Gemini's "model temporarily overloaded" response — explicitly
  // described as usually transient, so it's worth retrying like any other
  // 5xx.
  if (typeof status === "number" && status >= 500) return true;
  // Network-level failures (fetch threw, no response at all) arrive here
  // with status undefined.
  if (!status) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Gemini via our own /api/gemini serverless proxy and returns the raw
 * text content. The proxy exists because generativelanguage.googleapis.com
 * doesn't send CORS headers for browser-origin requests — calling it
 * directly from the client fails with "Failed to fetch" regardless of
 * whether the API key or model name is valid. The proxy holds the API key
 * server-side and forwards the request, which also keeps the key out of
 * the client bundle entirely (an improvement over the old Groq setup,
 * which called the API directly from the browser with the key exposed).
 *
 * Automatically retries transient failures (network errors, 5xx) with
 * exponential backoff — up to 2 retries (3 attempts total). Rate limits and
 * auth errors are never retried; they surface immediately.
 * @param {Object} params
 * @param {string} params.system - system instruction
 * @param {string} params.prompt - user prompt
 * @param {number} [params.temperature=0.7]
 * @param {number} [params.maxTokens=4096]
 * @param {boolean} [params.json=false] - request JSON output
 * @param {Object} [params.schema] - Gemini responseSchema; only applied
 *   when json is true. Enforces structural validity server-side instead of
 *   just hoping the model's prose-described JSON shape holds up.
 * @param {string} [params.model=MODEL_LARGE] - which Gemini model to use
 * @param {string} [params.thinkingLevel="LOW"] - MINIMAL/LOW/MEDIUM/HIGH.
 *   Thinking tokens draw from the same maxTokens budget as the visible
 *   response, so keeping this low leaves more room for the actual output
 *   instead of it getting truncated mid-generation.
 */
export async function generateCompletion({
  system,
  prompt,
  temperature = 0.7,
  maxTokens = 4096,
  json = false,
  schema,
  model = MODEL_LARGE,
  thinkingLevel = "LOW",
}) {
  // Gemini's 503 "model overloaded" errors are explicitly billed as usually
  // temporary, so this gets a bit more patience than a plain network blip:
  // 3 retries with growing backoff (700ms/1400ms/2800ms, ~4.9s total) before
  // giving up.
  const maxRetries = 3;
  let lastErr;
  let lastStatus;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug("Calling Gemini proxy", { model, json, attempt: attempt + 1 });

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, prompt, temperature, maxTokens, json, schema, model, thinkingLevel }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const err = new Error(data?.error || `Proxy request failed (${res.status})`);
        err.status = res.status;
        throw err;
      }

      const content = data?.text;

      if (!content) {
        throw new Error("Empty response from Gemini");
      }

      if (data.usageMetadata) {
        const { promptTokenCount, candidatesTokenCount, totalTokenCount } =
          data.usageMetadata;
        logger.info(
          `Gemini usage [${model}] — prompt: ${promptTokenCount}, ` +
            `completion: ${candidatesTokenCount}, total: ${totalTokenCount}`
        );
        recordUsage(model, totalTokenCount);
      }

      return content;
    } catch (err) {
      lastErr = err;
      lastStatus = err?.status;

      if (attempt < maxRetries && isRetryableError(lastStatus)) {
        const backoffMs = 700 * 2 ** attempt; // 700ms, 1400ms, 2800ms
        logger.error(
          `Gemini call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms:`,
          err
        );
        await sleep(backoffMs);
        continue;
      }

      break;
    }
  }

  logger.error("Gemini API call failed:", lastErr);

  if (lastStatus === 429) {
    throw new RateLimitError(
      "Gemini's free-tier rate limit has been reached for this app. Please wait a bit and try again."
    );
  }

  if (lastStatus === 401 || lastStatus === 403 || lastStatus === 500) {
    throw new Error("The AI service isn't configured correctly. Check the server's Gemini API key.");
  }

  if (lastStatus === 503) {
    throw new Error(
      "Gemini's servers are temporarily overloaded. This usually clears up within a minute or two — please try again shortly."
    );
  }

  throw new Error("Failed to generate response from AI. Please try again.");
}
