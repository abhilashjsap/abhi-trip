// Coerces a value that's SUPPOSED to be a plain string (per our schemas) into
// one safe to render as a React child. Needed because Ollama's `format:
// "json"` mode (see ollama.js) doesn't enforce response shape the way
// Gemini's responseSchema does, so a local model can return e.g.
// `{ item, reason }` where a plain string was expected — which otherwise
// crashes React with "Objects are not valid as a React child".
export function toDisplayText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    return value.item || value.text || value.name || value.reason || JSON.stringify(value);
  }
  return String(value);
}
