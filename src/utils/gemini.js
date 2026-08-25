import { GoogleGenAI } from "@google/genai";
import logger from "./logger";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  logger.error("VITE_GEMINI_API_KEY is missing. Add it to your .env file (or your Vercel project's env vars).");
}

// Unlike the old Groq client, @google/genai throws synchronously in the
// constructor when no API key is present in a browser context — letting
// that escape at module load would take down the whole React app before it
// even renders. Swallow it here; generateCompletion below surfaces a clear
// error instead the moment it's actually called.
let geminiClient;
try {
  geminiClient = new GoogleGenAI({ apiKey });
} catch (err) {
  logger.error("Failed to initialize Gemini client:", err);
  geminiClient = null;
}
export { geminiClient };

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
function isRetryableError(err) {
  const status = err?.status;
  if (status === 429 || status === 401 || status === 403) return false;
  if (typeof status === "number" && status >= 500) return true;
  // Network-level failures typically arrive without a status at all.
  if (!status) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the Gemini API and returns the raw text content. Automatically
 * retries transient failures (network errors, 5xx) with exponential backoff
 * — up to 2 retries (3 attempts total). Rate limits and auth errors are
 * never retried; they surface immediately.
 * @param {Object} params
 * @param {string} params.system - system instruction
 * @param {string} params.prompt - user prompt
 * @param {number} [params.temperature=0.7]
 * @param {number} [params.maxTokens=4096]
 * @param {boolean} [params.json=false] - request JSON output
 * @param {string} [params.model=MODEL_LARGE] - which Gemini model to use
 */
export async function generateCompletion({
  system,
  prompt,
  temperature = 0.7,
  maxTokens = 4096,
  json = false,
  model = MODEL_LARGE,
}) {
  if (!geminiClient) {
    throw new Error("Invalid Gemini API key. Check your .env file.");
  }

  const maxRetries = 2;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug("Calling Gemini", { model, json, attempt: attempt + 1 });

      const response = await geminiClient.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          temperature,
          maxOutputTokens: maxTokens,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      });

      const content = response.text;

      if (!content) {
        throw new Error("Empty response from Gemini");
      }

      if (response.usageMetadata) {
        const { promptTokenCount, candidatesTokenCount, totalTokenCount } =
          response.usageMetadata;
        logger.info(
          `Gemini usage [${model}] — prompt: ${promptTokenCount}, ` +
            `completion: ${candidatesTokenCount}, total: ${totalTokenCount}`
        );
        recordUsage(model, totalTokenCount);
      }

      return content;
    } catch (err) {
      lastErr = err;

      if (attempt < maxRetries && isRetryableError(err)) {
        const backoffMs = 500 * 2 ** attempt; // 500ms, then 1000ms
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

  const status = lastErr?.status;
  const apiMessage = lastErr?.message || "";

  if (status === 429) {
    throw new RateLimitError(
      "Gemini's free-tier rate limit has been reached for this app. Please wait a bit and try again."
    );
  }

  if (status === 401 || status === 403 || apiMessage.includes("API key")) {
    throw new Error("Invalid Gemini API key. Check your .env file.");
  }

  throw new Error("Failed to generate response from AI. Please try again.");
}

export default { geminiClient, generateCompletion, RateLimitError, MODEL_LARGE, MODEL_SMALL, getTodayUsage };
