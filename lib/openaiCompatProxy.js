// Shared server-side proxy logic for every OpenAI-compatible chat-
// completions provider this app talks to (Groq, OpenRouter) — both need
// exactly the same thing: hold the API key server-side (the browser can't
// call either directly without bundling the key into client JS) and
// forward the request/stream through close to untouched. api/groq.js and
// api/openrouter.js are thin wrappers supplying just the base URL, the env
// var holding that provider's key, and any provider-specific extra headers.
// Lives outside api/ so Vercel doesn't treat it as its own route (same
// reasoning as lib/redis.js).
export function createOpenAICompatHandler({ baseUrl, apiKeyEnvVar, providerLabel, extraHeaders = {} }) {
  return {
    async fetch(request) {
      // A bare, unhandled throw anywhere in here crashes the whole function
      // invocation — the client then gets Vercel's own opaque
      // FUNCTION_INVOCATION_FAILED page (plain text, not JSON), not
      // whatever specific error actually happened. Wrapping the entire body
      // guarantees a parseable { error } response either way.
      try {
        if (request.method !== "POST") {
          return Response.json({ error: "Method not allowed" }, { status: 405 });
        }

        const apiKey = process.env[apiKeyEnvVar];
        if (!apiKey) {
          return Response.json({ error: `Server is missing ${apiKeyEnvVar}.` }, { status: 500 });
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body." }, { status: 400 });
        }

        const { messages, model, temperature, max_tokens, response_format, stream } = body || {};
        if (!messages || !model) {
          return Response.json({ error: "Missing required fields: messages, model." }, { status: 400 });
        }

        let upstreamRes;
        try {
          upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              ...extraHeaders,
            },
            body: JSON.stringify({ model, messages, temperature, max_tokens, response_format, stream: !!stream }),
          });
        } catch (err) {
          return Response.json({ error: `Request to ${providerLabel} failed: ${err.message}` }, { status: 502 });
        }

        const retryAfter = upstreamRes.headers.get("retry-after");
        const passthroughHeaders = retryAfter ? { "Retry-After": retryAfter } : {};

        if (stream) {
          // Forward the upstream SSE body through untouched — the client
          // parses the standard OpenAI-compatible chunk format itself. A
          // non-2xx here means the error happened before any streaming
          // started (upstream returns plain JSON in that case), so the
          // original status/body still comes through correctly either way.
          return new Response(upstreamRes.body, {
            status: upstreamRes.status,
            headers: { "Content-Type": "text/event-stream; charset=utf-8", ...passthroughHeaders },
          });
        }

        // Read as text first — an upstream 500 can come back as plain text
        // (not JSON), which would otherwise silently collapse into the
        // generic fallback message with no indication what actually broke.
        const rawText = await upstreamRes.text();
        let data = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          // Non-JSON body — rawText itself still gets surfaced below.
        }

        if (!upstreamRes.ok) {
          return Response.json(
            {
              error:
                data?.error?.message ||
                data?.error ||
                `${providerLabel} request failed (${upstreamRes.status}): ${rawText.slice(0, 300) || "(empty body)"}`,
            },
            { status: upstreamRes.status, headers: passthroughHeaders }
          );
        }
        return Response.json(data, { headers: passthroughHeaders });
      } catch (err) {
        return Response.json(
          { error: `${providerLabel} proxy crashed: ${err?.message || err}` },
          { status: 500 }
        );
      }
    },
  };
}
