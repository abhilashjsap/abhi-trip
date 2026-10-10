// Provider-agnostic error classes and streaming guards shared by gemini.js
// and ollama.js — split out so both can import them without either file
// depending on the other (generateCompletion in gemini.js delegates to
// ollama.js when VITE_AI_PROVIDER=ollama, so ollama.js can't import back
// from gemini.js without a circular dependency).

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
 * Thrown when the streamed response ends without an explicit clean finish
 * signal (Gemini's finishReason !== "STOP", or Ollama's stream ending
 * without a final `done: true` line) — the provider stops emitting chunks
 * without ever throwing, so the caller would otherwise receive a
 * plausible-looking but truncated fragment with no indication anything
 * went wrong. Has no `.status`, so — like RepetitionLoopError — it rides
 * generateCompletion's existing retry-as-transient path.
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
export function hasRunawayRepetition(text) {
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
export function createRunawayStringGuard(maxLen = 4000) {
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
