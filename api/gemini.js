import { GoogleGenAI } from "@google/genai";

// Server-side only — never prefixed with VITE_, so Vite never bundles it
// into client JS. This is what actually fixes both the CORS problem
// (browsers can't call generativelanguage.googleapis.com directly — no
// Access-Control-Allow-Origin) and the pre-existing API-key-in-the-bundle
// exposure risk in one move.
const apiKey = process.env.GEMINI_API_KEY;

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    if (!apiKey) {
      return Response.json(
        { error: "Server is missing GEMINI_API_KEY." },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const {
      system,
      prompt,
      temperature = 0.7,
      maxTokens = 4096,
      json = false,
      model,
      thinkingLevel = "LOW",
    } = body || {};

    if (!prompt || !model) {
      return Response.json(
        { error: "Missing required fields: prompt, model." },
        { status: 400 }
      );
    }

    const client = new GoogleGenAI({ apiKey });

    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          temperature,
          maxOutputTokens: maxTokens,
          // Gemini 3.5 models think by default (medium level), and those
          // thinking tokens are drawn from the same maxOutputTokens budget
          // as the visible response — with thinking left uncapped, it can
          // eat most of the budget and leave the actual JSON truncated
          // mid-string. thinkingLevel (not the older thinkingBudget, which
          // 3.5 models reject) keeps that overhead small.
          thinkingConfig: { thinkingLevel },
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      });

      return Response.json({
        text: response.text,
        usageMetadata: response.usageMetadata || null,
      });
    } catch (err) {
      const status = typeof err?.status === "number" ? err.status : 502;
      return Response.json(
        { error: err?.message || "Gemini request failed." },
        { status }
      );
    }
  },
};
