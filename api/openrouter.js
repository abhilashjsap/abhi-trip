import { createOpenAICompatHandler } from "../lib/openaiCompatProxy.js";

export default createOpenAICompatHandler({
  baseUrl: "https://openrouter.ai/api/v1",
  apiKeyEnvVar: "OPENROUTER_API_KEY",
  providerLabel: "OpenRouter",
  // Optional attribution headers OpenRouter's docs recommend (not required)
  // — shows up on their own dashboard/leaderboards, nothing user-specific.
  extraHeaders: { "X-Title": "AbhiTrip" },
});
