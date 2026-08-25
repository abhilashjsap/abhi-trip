import Groq from "groq-sdk";
import logger from "./logger";

const apiKey = import.meta.env.VITE_GROQ_API_KEY;

if (!apiKey) {
  logger.error("VITE_GROQ_API_KEY is missing. Add it to your .env file.");
}

// NOTE: dangerouslyAllowBrowser is fine for a personal project where the
// key has low stakes. If you ever deploy this publicly or care about
// rate-limit abuse, move this call behind a Vercel serverless function
// instead (keep the prompt-building logic in tripAI.js unchanged).
export const groqClient = new Groq({
  apiKey,
  dangerouslyAllowBrowser: true,
});

// Two separate models, on two separate Groq rate-limit pools. Splitting
// calls across them means the small/simple calls no longer eat into the
// same daily token budget as the big plan generation.
// NOTE: Groq deprecated llama-3.3-70b-versatile and llama-3.1-8b-instant
// (shut down Aug 16, 2026) — migrated to their official replacements.
export const MODEL_LARGE = "openai/gpt-oss-120b"; // main plan: needs real reasoning quality
export const MODEL_SMALL = "openai/gpt-oss-20b"; // feasibility/category estimates: simple JSON+arithmetic, own quota pool

const USAGE_STORAGE_KEY = "abhitrip_usage_log";

/**
 * Reads today's recorded token usage per model from localStorage. Usage
 * entries are date-stamped so a new day always starts fresh — this mirrors
 * Groq's own daily reset, giving the UI an honest (if approximate) picture
 * of remaining daily quota without calling Groq's billing API.
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
 * Thrown when Groq's rate limit (requests/tokens per minute or per day) is
 * hit. Carries the destination's retry-after hint (in seconds, if Groq
 * provided one) so the UI can show a genuinely useful wait time instead of
 * a generic "try again" message.
 */
export class RateLimitError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds || null;
  }
}

/**
 * Parses a Groq "Please try again in 1h47m17.664s" style message into
 * total seconds, so the UI can format it however it likes.
 */
function parseRetryAfter(message) {
  if (!message) return null;
  const match = message.match(
    /try again in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i
  );
  if (!match) return null;
  const [, h, m, s] = match;
  const seconds =
    (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
  return seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * Classifies whether an error is worth retrying. Only transient issues
 * (network blips, 5xx server errors, timeouts) qualify — rate limits (429)
 * and auth failures (401) never do, since retrying those either wastes
 * quota or can never succeed.
 */
function isRetryableError(err) {
  const status = err?.status;
  if (status === 429 || status === 401) return false;
  if (typeof status === "number" && status >= 500) return true;
  // Network-level failures typically arrive without a status at all.
  if (!status) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Groq chat completion and returns the raw text content. Automatically
 * retries transient failures (network errors, 5xx) with exponential backoff
 * — up to 2 retries (3 attempts total). Rate limits and auth errors are
 * never retried; they surface immediately.
 * @param {Object} params
 * @param {string} params.system - system prompt
 * @param {string} params.prompt - user prompt
 * @param {number} [params.temperature=0.7]
 * @param {number} [params.maxTokens=4096]
 * @param {boolean} [params.json=false] - request JSON mode
 * @param {string} [params.model=MODEL_LARGE] - which Groq model to use
 */
export async function generateCompletion({
  system,
  prompt,
  temperature = 0.7,
  maxTokens = 4096,
  json = false,
  model = MODEL_LARGE,
}) {
  const maxRetries = 2;
  let lastErr;

  // gpt-oss models are reasoning models — by default they spend part of
  // the token budget "thinking" before writing the actual answer. Left at
  // Groq's default ("medium"), a tight max_tokens budget can be entirely
  // consumed by reasoning, leaving nothing for the JSON output itself
  // (surfaces as a 400 json_validate_failed with an EMPTY failed_generation
  // — a known Groq gpt-oss quirk, not a prompt problem). "low" keeps
  // reasoning brief so more of the budget goes to the actual response,
  // which matters most for our small, simple JSON-only calls.
  const isReasoningModel = model.startsWith("openai/gpt-oss");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug("Calling Groq", { model, json, attempt: attempt + 1 });

      const completion = await groqClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        ...(isReasoningModel ? { reasoning_effort: "low" } : {}),
      });

      const content = completion.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Empty response from Groq");
      }

      if (completion.usage) {
        logger.info(
          `Groq usage [${model}] — prompt: ${completion.usage.prompt_tokens}, ` +
            `completion: ${completion.usage.completion_tokens}, ` +
            `total: ${completion.usage.total_tokens}`
        );
        recordUsage(model, completion.usage.total_tokens);
      }

      return content;
    } catch (err) {
      lastErr = err;

      if (attempt < maxRetries && isRetryableError(err)) {
        const backoffMs = 500 * 2 ** attempt; // 500ms, then 1000ms
        logger.error(
          `Groq call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms:`,
          err
        );
        await sleep(backoffMs);
        continue;
      }

      break;
    }
  }

  logger.error("Groq API call failed:", lastErr);

  const status = lastErr?.status;
  const apiMessage = lastErr?.error?.error?.message || lastErr?.message || "";

  // 413 here isn't "message too big to send" — Groq rejects the request
  // before running it because (prompt tokens + maxTokens) exceeds the
  // model's tokens-per-minute cap. Surface it as a rate limit, not a
  // generic failure, so the UI doesn't tell the user to just "try again"
  // when the same request would fail again immediately.
  if (status === 413) {
    throw new RateLimitError(
      "This request is too large for Groq's per-minute token limit on this model right now. Please try again in a minute."
    );
  }

  if (status === 429 || apiMessage.toLowerCase().includes("rate limit")) {
    const retryAfterSeconds = parseRetryAfter(apiMessage);
    throw new RateLimitError(
      "Groq's daily free-tier limit has been reached for this app.",
      retryAfterSeconds
    );
  }

  if (status === 401 || apiMessage.includes("401")) {
    throw new Error("Invalid Groq API key. Check your .env file.");
  }

  throw new Error("Failed to generate response from AI. Please try again.");
}

export default { groqClient, generateCompletion, RateLimitError, MODEL_LARGE, MODEL_SMALL, getTodayUsage };
