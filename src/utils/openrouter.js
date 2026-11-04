import { generateOpenAICompatCompletion } from "./openaiCompatProvider";

// OpenRouter's OpenAI-compatible chat completions API, via this app's own
// /api/openrouter proxy (keeps OPENROUTER_API_KEY server-side, same
// reasoning as /api/gemini).
//
// Models confirmed live (2026-11-04) directly against OpenRouter's own
// /api/v1/models endpoint, filtered to id ending ":free" — these rotate in
// and out of OpenRouter's free catalog over time, so re-check that endpoint
// if either ever 404s. nvidia/nemotron-3.5-super-vl:free has the largest
// context window (1M tokens) of the free models that support
// response_format; xingchen-agi/xing4.0-29b-a4b:free is the fallback, with
// its own separate quota.
export const OPENROUTER_MODEL_LARGE = "nvidia/nemotron-3.5-super-vl:free";
export const OPENROUTER_MODEL_FALLBACK = "xingchen-agi/xing4.0-29b-a4b:free";

// Only forwards the fields openaiCompatProvider.js actually understands —
// see groq.js for why this can't be a blind `...params` spread.
export async function generateOpenRouterCompletion({
  system,
  prompt,
  temperature,
  maxTokens,
  json,
  onChunk,
}) {
  return generateOpenAICompatCompletion({
    proxyPath: "/api/openrouter",
    providerLabel: "OpenRouter",
    model: OPENROUTER_MODEL_LARGE,
    fallbackModel: OPENROUTER_MODEL_FALLBACK,
    system,
    prompt,
    temperature,
    maxTokens,
    json,
    onChunk,
  });
}
