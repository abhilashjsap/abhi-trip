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

const MODEL = "llama-3.3-70b-versatile";

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
 * Calls Groq chat completion and returns the raw text content.
 * @param {Object} params
 * @param {string} params.system - system prompt
 * @param {string} params.prompt - user prompt
 * @param {number} [params.temperature=0.7]
 * @param {number} [params.maxTokens=4096]
 * @param {boolean} [params.json=false] - request JSON mode
 */
export async function generateCompletion({
  system,
  prompt,
  temperature = 0.7,
  maxTokens = 4096,
  json = false,
}) {
  try {
    logger.debug("Calling Groq", { model: MODEL, json });

    const completion = await groqClient.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });

    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from Groq");
    }

    return content;
  } catch (err) {
    logger.error("Groq API call failed:", err);

    const status = err?.status;
    const apiMessage = err?.error?.error?.message || err?.message || "";

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
}

export default { groqClient, generateCompletion, RateLimitError };