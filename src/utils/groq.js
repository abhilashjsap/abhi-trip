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
    throw new Error(
      err?.message?.includes("401")
        ? "Invalid Groq API key. Check your .env file."
        : "Failed to generate response from AI. Please try again."
    );
  }
}

export default { groqClient, generateCompletion };
