import logger from "./logger";
import {
  RepetitionLoopError,
  IncompleteResponseError,
  hasRunawayRepetition,
  createRunawayStringGuard,
} from "./aiGuards";

// Talks directly to a locally running Ollama server (`ollama serve`,
// default port 11434) from the browser — no server-side proxy, since
// there's nothing for a deployed Vercel function to reach (Ollama runs on
// YOUR machine, not Vercel's). Works both from a local `vite dev` session
// AND from the deployed site, as long as the browser making the request is
// on the same machine Ollama is running on — the model choice itself (see
// ModelSelector.jsx) is a per-generation UI pick, not a build-time env var
// anymore, though VITE_OLLAMA_MODEL still works as a fallback default for
// any caller that doesn't pass one explicitly.
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL || "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lists models already pulled on the local Ollama server, for the model
 * picker on the homepage to offer as "private/local" choices alongside
 * Gemini. Never throws: returns [] if Ollama isn't running, isn't
 * reachable, or — commonly — is blocked by Ollama's own CORS policy, which
 * by default only allows requests from 127.0.0.1/0.0.0.0, NOT arbitrary
 * origins like a Vite dev server's http://localhost:5173 or a deployed
 * site. Set OLLAMA_ORIGINS (then restart Ollama) to allow this app's
 * actual origin if detection comes back empty despite Ollama running.
 * @returns {Promise<string[]>} model names (e.g. "llama3.2:latest"), as
 *   accepted by the `model` field of /api/chat
 */
export async function listOllamaModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m) => m.model || m.name).filter(Boolean);
  } catch (err) {
    logger.debug("Ollama model detection failed (not running, unreachable, or CORS-blocked):", err);
    return [];
  }
}

/**
 * Ollama's equivalent of gemini.js's generateCompletion — same external
 * contract (system/prompt/temperature/maxTokens/json/onChunk in, text out)
 * so tripAI.js/tripChat.js need no changes to use either provider. Ignores
 * params that don't map onto Ollama's simpler API (schema, model,
 * fallbackModel, thinkingLevel are all Gemini-specific — see gemini.js's
 * docs): json mode here is Ollama's own `format: "json"`, which guarantees
 * syntactically valid JSON but — unlike Gemini's responseSchema — doesn't
 * enforce a specific shape. Relies on the same literal JSON-shape examples
 * already embedded in every prompt in this app, which is the only thing
 * keeping output shape-correct here.
 *
 * Retries only the two local, sampling-related failure modes this app
 * already guards against (repetition loops, incomplete streams) — there's
 * no quota/429 concept for a model running on your own machine, so none of
 * gemini.js's fallback-model/backoff machinery applies.
 * @param {string} [params.model] - which locally-pulled model to use (as
 *   returned by listOllamaModels/the model picker). Falls back to
 *   VITE_OLLAMA_MODEL if not given, for backward compatibility with the
 *   original env-var-only setup.
 */
export async function generateOllamaCompletion({
  system,
  prompt,
  temperature = 0.7,
  maxTokens = 4096,
  json = false,
  onChunk,
  model,
}) {
  const modelToUse = model || DEFAULT_OLLAMA_MODEL;
  if (!modelToUse) {
    throw new Error(
      "No Ollama model selected, and VITE_OLLAMA_MODEL isn't set as a fallback — pick a local model from the homepage, or set VITE_OLLAMA_MODEL to one you've pulled (e.g. VITE_OLLAMA_MODEL=llama3.2)."
    );
  }

  const maxRetries = 2;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug("Calling Ollama", { model: modelToUse, json, attempt: attempt + 1 });

      let res;
      try {
        res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelToUse,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            stream: true,
            ...(json ? { format: "json" } : {}),
            options: { temperature, num_predict: maxTokens },
          }),
        });
      } catch (networkErr) {
        // Thrown immediately, outside the retry loop's transient-error
        // handling below — if Ollama isn't running at all, retrying won't
        // help and just delays telling the user the actual fix.
        throw new Error(
          `Couldn't reach Ollama at ${OLLAMA_BASE_URL} — is \`ollama serve\` running? (${networkErr.message})`
        );
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ollama request failed (${res.status}): ${text.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const feedRunawayStringGuard = createRunawayStringGuard();
      let full = "";
      let buffer = "";
      let sawDone = false;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Ollama's stream is NDJSON — one complete JSON object per line,
        // not guaranteed to align with chunk boundaries, hence buffering
        // whatever's left of the last (possibly incomplete) line.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          let obj;
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }

          const delta = obj.message?.content || "";
          if (delta) {
            full += delta;
            onChunk?.(full);
          }
          if (obj.done) sawDone = true;

          if ((delta && feedRunawayStringGuard(delta)) || hasRunawayRepetition(full)) {
            reader.cancel().catch(() => {});
            throw new RepetitionLoopError(
              "The AI got stuck repeating itself instead of finishing the response."
            );
          }
        }
      }

      if (!sawDone) {
        throw new IncompleteResponseError(
          "The AI stopped before finishing (no finish signal received)."
        );
      }
      if (!full) {
        throw new Error("Empty response from Ollama");
      }

      return full;
    } catch (err) {
      lastErr = err;
      const isRepetitionLoop = err instanceof RepetitionLoopError;
      const isIncomplete = err instanceof IncompleteResponseError;

      if (attempt < maxRetries && (isRepetitionLoop || isIncomplete)) {
        logger.error(`Ollama call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying:`, err);
        await sleep(0);
        continue;
      }
      break;
    }
  }

  logger.error("Ollama call failed:", lastErr);
  throw lastErr instanceof Error ? lastErr : new Error("Failed to generate response from Ollama.");
}
