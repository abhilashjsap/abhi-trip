import logger from "./logger";
import {
  RepetitionLoopError,
  IncompleteResponseError,
  RateLimitError,
  hasRunawayRepetition,
  createRunawayStringGuard,
} from "./aiGuards";

// Shared client logic for every OpenAI-compatible chat-completions provider
// this app talks to (Groq, OpenRouter) — both speak the identical request/
// response shape (choices[].message/delta.content, finish_reason, SSE
// streaming ending in "data: [DONE]"), differing only in base URL, auth,
// and which models/limits they offer. groq.js/openrouter.js each just
// supply those specifics (proxyPath, label, models) and call into this.
//
// Deliberately uses `response_format: {type: "json_object"}` rather than
// the stricter `json_schema` mode both providers support: that stricter
// mode requires every existing schema in tripSchemas.js (written in
// Gemini's own proprietary Schema format — uppercase type names, numeric
// constraints as strings) to be rewritten as standard JSON Schema with
// `additionalProperties: false` and all fields required (optional fields
// expressed as nullable unions) on every nested object — a large,
// error-prone conversion with no live key to verify it against. json_object
// mode guarantees syntactically valid JSON but not exact shape, same
// tradeoff Ollama already has — and the same defensive toDisplayText()
// rendering already added for Ollama covers this risk here too.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  if (status === 429 || status === 401 || status === 403) return false;
  if (typeof status === "number" && status >= 500) return true;
  if (!status) return true;
  return false;
}

/**
 * @param {string} params.proxyPath - this app's own serverless proxy route
 *   (e.g. "/api/groq") — never calls the provider directly from the
 *   browser, so the API key stays server-side.
 * @param {string} params.providerLabel - for error messages, e.g. "Groq".
 * @param {string} params.model - primary model id.
 * @param {string} [params.fallbackModel] - tried once, with its own fresh
 *   retry budget, if the primary exhausts its retries or hits a rate limit
 *   with no usable retry-after hint.
 */
export async function generateOpenAICompatCompletion({
  proxyPath,
  providerLabel,
  system,
  prompt,
  temperature = 0.7,
  maxTokens = 4096,
  json = false,
  model,
  fallbackModel,
  onChunk,
}) {
  let maxRetries = 3;
  let lastErr;
  let lastStatus;
  let lastRetryAfterMs = null;
  let usedFallback = false;
  let modelSwitchedAtAttempt = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptOnModel = attempt - modelSwitchedAtAttempt;
    try {
      logger.debug(`Calling ${providerLabel} proxy`, { model, json, stream: !!onChunk, attempt: attemptOnModel + 1 });

      const res = await fetch(proxyPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          stream: !!onChunk,
        }),
      });

      if (!res.ok) {
        const retryAfterHeader = res.headers.get("retry-after");
        lastRetryAfterMs = retryAfterHeader ? Math.ceil(parseFloat(retryAfterHeader) * 1000) : null;
        const data = await res.json().catch(() => null);
        const message = data?.error?.message || data?.error || `${providerLabel} request failed (${res.status})`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
      }

      let content, finishReason;

      if (onChunk) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const feedRunawayStringGuard = createRunawayStringGuard();
        let full = "";
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            // Lines starting with ":" are keep-alive comments (OpenRouter
            // sends these); blank lines just separate SSE events.
            if (!trimmed || trimmed.startsWith(":")) continue;
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;

            let chunk;
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }

            const delta = chunk.choices?.[0]?.delta?.content || "";
            if (delta) {
              full += delta;
              onChunk(full);
            }
            const reason = chunk.choices?.[0]?.finish_reason;
            if (reason) finishReason = reason;

            if ((delta && feedRunawayStringGuard(delta)) || hasRunawayRepetition(full)) {
              reader.cancel().catch(() => {});
              throw new RepetitionLoopError(
                "The AI got stuck repeating itself instead of finishing the response."
              );
            }
          }
        }

        if (finishReason !== "stop") {
          throw new IncompleteResponseError(
            `The AI stopped before finishing (${finishReason || "no finish signal received"}).`,
            finishReason
          );
        }
        content = full;
      } else {
        const data = await res.json();
        content = data?.choices?.[0]?.message?.content;
        finishReason = data?.choices?.[0]?.finish_reason;

        if (content && (hasRunawayRepetition(content) || createRunawayStringGuard()(content))) {
          throw new RepetitionLoopError(
            "The AI got stuck repeating itself instead of finishing the response."
          );
        }
        if (finishReason !== "stop") {
          throw new IncompleteResponseError(
            `The AI stopped before finishing (${finishReason || "no finish signal received"}).`,
            finishReason
          );
        }
      }

      if (!content) {
        throw new Error(`Empty response from ${providerLabel}`);
      }

      return content;
    } catch (err) {
      lastErr = err;
      lastStatus = err?.status;

      // A 429 with a usable retry-after hint is almost always a brief burst
      // limit, not real exhaustion — worth waiting out on the SAME model.
      // With no hint, there's no useful wait time to retry with, so it goes
      // straight to the fallback-eligible check below instead (NOT folded
      // into isTransient — isRetryableStatus(429) is deliberately false, so
      // a hint-less 429 must stay out of the same-model retry path or it'd
      // silently fall through both branches and give up with no fallback
      // attempt at all).
      const canRetryRateLimit = lastStatus === 429 && lastRetryAfterMs != null;

      const isRepetitionLoop = err instanceof RepetitionLoopError;
      const isIncomplete = err instanceof IncompleteResponseError;
      const isGenericTransient = isRepetitionLoop || isIncomplete || isRetryableStatus(lastStatus);

      if (attempt < maxRetries && (isGenericTransient || canRetryRateLimit)) {
        const backoffMs = canRetryRateLimit
          ? Math.min(Math.max(lastRetryAfterMs, 1000), 15000)
          : isRepetitionLoop || isIncomplete
            ? 0
            : 700 * 2 ** attemptOnModel;
        logger.error(
          `${providerLabel} call failed (${model}, attempt ${attemptOnModel + 1} of ${maxRetries - modelSwitchedAtAttempt + 1}), retrying in ${backoffMs}ms:`,
          err
        );
        await sleep(backoffMs);
        lastRetryAfterMs = null;
        continue;
      }

      // Eligible for a fallback-model switch whenever the primary is well
      // and truly done with this attempt — either exhausted its generic
      // retries, or hit ANY 429 (with or without a retry-after hint; a
      // hint-less one skips the retry branch above entirely and lands here
      // immediately rather than wasting an attempt with no idea how long to
      // wait).
      if ((isGenericTransient || lastStatus === 429) && fallbackModel && !usedFallback && lastStatus !== 401 && lastStatus !== 403) {
        logger.error(`${model} exhausted its retries on ${providerLabel}, falling back to ${fallbackModel}:`, err);
        model = fallbackModel;
        usedFallback = true;
        modelSwitchedAtAttempt = attempt + 1;
        maxRetries = attempt + 4;
        continue;
      }

      break;
    }
  }

  logger.error(`${providerLabel} API call failed:`, lastErr);

  if (lastErr instanceof RepetitionLoopError) {
    throw new Error(
      usedFallback
        ? `The AI kept getting stuck repeating itself on both the main and backup ${providerLabel} models. Please try again.`
        : `The AI kept getting stuck repeating itself and couldn't finish. Please try again.`
    );
  }

  if (lastErr instanceof IncompleteResponseError) {
    throw new Error(
      usedFallback
        ? `Both the main and backup ${providerLabel} models kept stopping before finishing (${
            lastErr.finishReason || "no finish signal received"
          }). Please try again.`
        : `The AI kept stopping before finishing its response (${
            lastErr.finishReason || "no finish signal received"
          }). Please try again.`
    );
  }

  if (lastStatus === 429) {
    throw new RateLimitError(
      `${providerLabel}'s free-tier rate limit has been reached for this app. Please wait a bit and try again.`
    );
  }

  if (lastStatus === 401 || lastStatus === 403 || lastStatus === 500) {
    throw new Error(`The AI service isn't configured correctly. Check the server's ${providerLabel} API key.`);
  }

  throw new Error(`Failed to generate response from ${providerLabel}. Please try again.`);
}
