import logger from "./logger";

// Two separate models, each with its own free-tier quota. Mirrors the old
// Groq split: the big model handles the full plan (needs real quality),
// the small/lite one handles the cheap feasibility + budget-estimate JSON.
//
// MODEL_LARGE moved off gemini-3.5-flash (2026-09-01): a newer preview-tier
// model with an unusually tight 20-requests/day free quota (confirmed live
// via a real 429) AND a decoder repetition-loop bug that kept recurring
// near-100% of attempts on multiple distinct destinations even after
// schema maxLength caps, a lowered temperature, and fixing a destination-
// string quality issue — none of which reduced the frequency, pointing at
// the model itself rather than anything in this app's prompt/schema.
//
// First tried gemini-2.5-flash, which immediately 404'd live: "This model
// models/gemini-2.5-flash is no longer available to new users." — the
// model lineup had already moved past what research/training data showed.
// Google's own error named the replacement directly: gemini-3.6-flash.
// Following that first-party live signal over further (evidently stale)
// web research.
export const MODEL_LARGE = "gemini-3.6-flash";
export const MODEL_SMALL = "gemini-3.5-flash-lite";

const USAGE_STORAGE_KEY = "abhitrip_usage_log";

// The free tier's actual binding constraint is a hard REQUEST COUNT per day
// (confirmed live via a real 429: quotaId
// GenerateRequestsPerDayPerProjectPerModel-FreeTier, quotaValue "20" for
// gemini-3.5-flash) — not a token budget, which is why this only tracks
// request counts now rather than cumulative tokens. Every attempt that
// reaches the network counts, including retries, since a retry after a
// repetition-loop or incomplete-response guard is a genuine completed
// Gemini call, not a free do-over.
function readTodayUsageRaw() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // Normalize rather than trust the stored shape outright — a browser
    // that used an earlier build today (pre-dating this request-count
    // tracking) has `{date, usage: {...}}` cached with no `requests` key at
    // all, same date, which crashed getTodayRequestCounts() on destructuring
    // (blank-screened the whole app right after unlocking, since
    // UsageDashboard renders immediately and nothing catches the throw).
    if (parsed?.date === today) {
      return { date: today, requests: parsed.requests || {} };
    }
  } catch {
    // Corrupted or inaccessible storage — fall through to a fresh start.
  }
  return { date: today, requests: {} };
}

function writeTodayUsageRaw(data) {
  try {
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — usage tracking is best-effort only.
  }
}

/** Reads today's recorded REQUEST COUNT per model — the real quota ceiling. */
export function getTodayRequestCounts() {
  const { requests } = readTodayUsageRaw();
  return { [MODEL_LARGE]: requests[MODEL_LARGE] || 0, [MODEL_SMALL]: requests[MODEL_SMALL] || 0 };
}

/** Call once per actual network attempt to Gemini (including retries) —
 * that's what the daily quota actually meters, regardless of outcome. */
function recordRequest(model) {
  const data = readTodayUsageRaw();
  data.requests[model] = (data.requests[model] || 0) + 1;
  writeTodayUsageRaw(data);
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
 * Thrown when the model's own token decoding gets stuck in a repetition
 * loop (observed live: a currency-info field ballooned to 73,000+ chars of
 * repeated "Bye!", another time a single field passed 165,000 chars) —
 * burning the entire token budget on garbage and truncating the rest of the
 * JSON. Gemini's schema `maxLength` does NOT reliably stop this during
 * decoding (confirmed: it recurred after adding maxLength to every prose
 * field), so this is caught live from the stream instead. Has no `.status`,
 * so it flows through generateCompletion's existing retry-as-transient path
 * (isRetryableError treats a missing status as retryable) — a fresh sampling
 * attempt essentially never repeats the same loop.
 */
export class RepetitionLoopError extends Error {
  constructor(message) {
    super(message);
    this.name = "RepetitionLoopError";
  }
}

/**
 * Thrown when Gemini's streamed candidate reports a finishReason other than
 * STOP (MAX_TOKENS, SAFETY, RECITATION, LANGUAGE, OTHER, ...) — it stops
 * emitting chunks without ever throwing, so the caller would otherwise
 * receive a plausible-looking but truncated fragment with no indication
 * anything went wrong. Has no `.status`, so — like RepetitionLoopError — it
 * rides generateCompletion's existing retry-as-transient path.
 */
export class IncompleteResponseError extends Error {
  constructor(message, finishReason) {
    super(message);
    this.name = "IncompleteResponseError";
    this.finishReason = finishReason;
  }
}

/**
 * Cheap check for a unit repeating back-to-back at the very end of the text
 * so far (must contain a letter, to avoid flagging legitimate repeated JSON
 * punctuation/numbers). Only looks at the tail — cost stays constant
 * regardless of how much has streamed in.
 *
 * Two tiers, because a loop can degenerate at either granularity (both seen
 * live): short units (a word like "Bye!") need more repeats to rule out
 * coincidence; long units (a whole repeated sentence) are already
 * vanishingly unlikely to repeat 3+ times verbatim in real content, so they
 * don't need as many to confirm — which matters because a longer unit needs
 * a bigger tail window to even fit enough repeats to check.
 */
function hasRunawayRepetition(text) {
  const TAIL = 2000;
  if (text.length < TAIL) return false;
  const tail = text.slice(-TAIL);

  const tiers = [
    { minLen: 3, maxLen: 20, minRepeats: 8 },
    { minLen: 21, maxLen: 150, minRepeats: 3 },
  ];

  for (const { minLen, maxLen, minRepeats } of tiers) {
    for (let unitLen = minLen; unitLen <= maxLen; unitLen++) {
      if (unitLen * minRepeats > TAIL) break;
      const unit = tail.slice(tail.length - unitLen);
      if (!/[a-zA-Z]/.test(unit)) continue;

      let matched = true;
      for (let i = 1; i < minRepeats; i++) {
        const start = tail.length - unitLen * (i + 1);
        if (tail.slice(start, start + unitLen) !== unit) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }
  }
  return false;
}

/**
 * Tracks whether the streamed text so far is currently inside a JSON string
 * value and how long that value has gotten, incrementally as each new delta
 * arrives (call `feed()` once per delta, in order). Independent of — and
 * more robust than — hasRunawayRepetition: that only catches an EXACT
 * repeated unit, so a loop that degenerates into varying-but-still-garbage
 * text (not a literal repeat) would slip past it. No legitimate field in
 * this app's schema needs anywhere near this many characters, repeating or
 * not, so this catches that whole class directly instead of pattern-matching
 * for one specific way a loop can look.
 */
function createRunawayStringGuard(maxLen = 4000) {
  let inString = false;
  let escaped = false;
  let curLen = 0;

  return function feed(delta) {
    for (let i = 0; i < delta.length; i++) {
      const ch = delta[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
          curLen = 0;
          continue;
        }
        curLen++;
        if (curLen > maxLen) return true;
      } else if (ch === '"') {
        inString = true;
        curLen = 0;
        escaped = false;
      }
    }
    return false;
  };
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
 * @param {(text: string) => void} [params.onChunk] - when provided, the
 *   request streams and this is called with the full accumulated text so
 *   far as each piece arrives (not just the delta), so the UI can just
 *   render whatever it's given. The full generation isn't structurally
 *   valid JSON until the stream completes — this is for a "feels alive"
 *   progress preview, not incremental parsing.
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
  onChunk,
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
      logger.debug("Calling Gemini proxy", { model, json, stream: !!onChunk, attempt: attempt + 1 });
      // Counts against the daily quota the moment the request goes out,
      // regardless of how it resolves — a 429/503/guard-rejected attempt
      // still consumed one of the day's 20 allowed calls to this model.
      recordRequest(model);

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system, prompt, temperature, maxTokens, json, schema, model, thinkingLevel,
          stream: !!onChunk,
        }),
      });

      let content, usageMetadata, finishReason;

      if (onChunk) {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const err = new Error(data?.error || `Proxy request failed (${res.status})`);
          err.status = res.status;
          throw err;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const feedRunawayStringGuard = createRunawayStringGuard();
        let full = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const piece = decoder.decode(value, { stream: true });
          let delta = "";
          // A NUL byte (never valid in the JSON/text content itself) marks
          // the trailing usage-metadata blob api/gemini.js appends after
          // the real content — see that file for why.
          const sentinelIdx = piece.indexOf(" ");
          if (sentinelIdx !== -1) {
            const visible = piece.slice(0, sentinelIdx);
            if (visible) {
              delta = visible;
              full += visible;
              onChunk(full);
            }
            try {
              const tail = JSON.parse(piece.slice(sentinelIdx + 1));
              usageMetadata = tail.usageMetadata;
              finishReason = tail.finishReason;
            } catch {
              // Best-effort only — losing the usage figure for this call
              // doesn't affect the actual generated content.
            }
          } else {
            delta = piece;
            full += piece;
            onChunk(full);
          }

          if (
            (delta && feedRunawayStringGuard(delta)) ||
            hasRunawayRepetition(full)
          ) {
            reader.cancel().catch(() => {});
            throw new RepetitionLoopError(
              "The AI got stuck repeating itself instead of finishing the response."
            );
          }
        }

        // Gemini can end the chunk sequence early — hitting maxOutputTokens,
        // a safety filter, recitation, etc., or (observed live: a 22-char
        // fragment, just `{"weather": {"months":`) the upstream connection
        // itself getting cut before Gemini's own final chunk ever arrives —
        // without ever throwing, leaving `full` a truncated fragment with no
        // indication anything went wrong. A genuinely complete generation
        // always ends with an explicit finishReason of STOP; treat anything
        // else, including it never arriving at all, as incomplete. This can
        // in principle false-positive if the trailing metadata blob itself
        // gets split across two stream reads (making finishReason silently
        // fail to parse even on an otherwise-complete generation), but that
        // only costs one extra retry — far cheaper than handing truncated
        // JSON to the caller as if it were done.
        if (finishReason !== "STOP") {
          throw new IncompleteResponseError(
            `The AI stopped before finishing (${finishReason || "no finish signal received"}).`,
            finishReason
          );
        }

        content = full;
      } else {
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const err = new Error(data?.error || `Proxy request failed (${res.status})`);
          err.status = res.status;
          throw err;
        }

        content = data?.text;
        usageMetadata = data?.usageMetadata;
        finishReason = data?.finishReason;

        // Same class of failure as the streaming path (see the comments
        // above) can happen here too — regenerateSection/regenerateItinerary
        // Day use this non-streaming branch and share the exact schemas that
        // have already produced runaway/repeating fields live.
        if (
          content &&
          (hasRunawayRepetition(content) || createRunawayStringGuard()(content))
        ) {
          throw new RepetitionLoopError(
            "The AI got stuck repeating itself instead of finishing the response."
          );
        }

        if (finishReason !== "STOP") {
          throw new IncompleteResponseError(
            `The AI stopped before finishing (${finishReason || "no finish signal received"}).`,
            finishReason
          );
        }
      }

      if (!content) {
        throw new Error("Empty response from Gemini");
      }

      if (usageMetadata) {
        const { promptTokenCount, candidatesTokenCount, totalTokenCount } = usageMetadata;
        logger.info(
          `Gemini usage [${model}] — prompt: ${promptTokenCount}, ` +
            `completion: ${candidatesTokenCount}, total: ${totalTokenCount}`
        );
      }

      return content;
    } catch (err) {
      lastErr = err;
      lastStatus = err?.status;

      const isRepetitionLoop = err instanceof RepetitionLoopError;
      const isIncomplete = err instanceof IncompleteResponseError;

      if (attempt < maxRetries && (isRepetitionLoop || isIncomplete || isRetryableError(lastStatus))) {
        // Neither a repetition loop nor an early non-STOP finish is a
        // network/server issue — a fresh sampling attempt is very unlikely
        // to hit the same problem, so there's no reason to wait before
        // retrying.
        const backoffMs = isRepetitionLoop || isIncomplete ? 0 : 700 * 2 ** attempt; // 700ms, 1400ms, 2800ms
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

  if (lastErr instanceof RepetitionLoopError) {
    throw new Error(
      "The AI kept getting stuck repeating itself and couldn't finish. Please try again."
    );
  }

  if (lastErr instanceof IncompleteResponseError) {
    throw new Error(
      `The AI kept stopping before finishing its response (${
        lastErr.finishReason || "no finish signal received"
      }). Please try again.`
    );
  }

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
