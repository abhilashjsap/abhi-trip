import { generateOpenAICompatCompletion } from "./openaiCompatProvider";

// Groq's OpenAI-compatible chat completions API, via this app's own /api/groq
// proxy (keeps GROQ_API_KEY server-side, same reasoning as /api/gemini).
//
// Models confirmed live (2026-11-04) against Groq's own docs: both are
// current production models (not deprecated/preview), each with its own
// separate free-tier quota — 30 requests/minute, 1,000 requests/day.
// openai/gpt-oss-120b is the stronger model; openai/gpt-oss-20b is the
// fallback, in the same "separate quota, fresh retry budget" role
// MODEL_FALLBACK plays for Gemini in gemini.js.
export const GROQ_MODEL_LARGE = "openai/gpt-oss-120b";
export const GROQ_MODEL_FALLBACK = "openai/gpt-oss-20b";

// Only forwards the fields openaiCompatProvider.js actually understands —
// NOT a blind `...params` spread. Every generateCompletion() call site
// passes Gemini-specific fields too (model: MODEL_LARGE, fallbackModel:
// MODEL_FALLBACK, schema, thinkingLevel), which would otherwise leak
// straight through as e.g. model: "gemini-3.6-flash" on a Groq request.
// Groq always uses its own two models above — no per-call override, same
// as Gemini's own model choice isn't overridable by the provider param.
export async function generateGroqCompletion({
  system,
  prompt,
  temperature,
  maxTokens,
  json,
  onChunk,
}) {
  return generateOpenAICompatCompletion({
    proxyPath: "/api/groq",
    providerLabel: "Groq",
    model: GROQ_MODEL_LARGE,
    fallbackModel: GROQ_MODEL_FALLBACK,
    system,
    prompt,
    temperature,
    maxTokens,
    json,
    onChunk,
    // gpt-oss models reason by default, spending part of the completion
    // budget on hidden chain-of-thought before any visible JSON — "low" is
    // the lightest option Groq exposes for this family (no "none"/off
    // value — that's Qwen-only per Groq's own docs). Confirmed live: left
    // at the default, this reliably burned the ENTIRE budget on these large
    // JSON generations with finish_reason "length" and empty content.
    extraBody: { reasoning_effort: "low" },
  });
}
