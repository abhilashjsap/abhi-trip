import { createOpenAICompatHandler } from "../lib/openaiCompatProxy";

export default createOpenAICompatHandler({
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnvVar: "GROQ_API_KEY",
  providerLabel: "Groq",
});
