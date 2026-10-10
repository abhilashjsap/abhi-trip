import logger from "./logger";
import {
  RepetitionLoopError,
  IncompleteResponseError,
  hasRunawayRepetition,
  createRunawayStringGuard,
} from "./aiGuards";

// Local-dev-only provider: talks directly to a locally running Ollama
// server (`ollama serve`, default port 11434) from the browser — no
// server-side proxy, since there's nothing for a deployed Vercel function
// to reach (Ollama runs on YOUR machine, not Vercel's). Only takes effect
// when VITE_AI_PROVIDER=ollama is set (see gemini.js's generateCompletion,
// which checks this before doing anything Gemini-specific) — set it in a
// local .env file, never in the deployed environment's variables.
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL || "http://localhost:11434";
// No hardcoded default model — picking one that isn't actually pulled would
// just trade a clear "set this" error for a confusing 404 from Ollama.
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 */
export async function generateOllamaCompletion({
  system,
  prompt,
  temperature = 0.7,
  maxTokens = 4096,
  json = false,
  onChunk,
}) {
  if (!OLLAMA_MODEL) {
    throw new Error(
      "VITE_AI_PROVIDER=ollama is set but VITE_OLLAMA_MODEL isn't — set it to a model you've pulled locally, e.g. VITE_OLLAMA_MODEL=llama3.2"
    );
  }

  const maxRetries = 2;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug("Calling Ollama", { model: OLLAMA_MODEL, json, attempt: attempt + 1 });

      let res;
      try {
        res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
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
