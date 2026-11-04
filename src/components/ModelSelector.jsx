import { useEffect, useState } from "react";
import { listOllamaModels } from "../utils/ollama";

// Fixed cloud options — always available (no detection needed), unlike
// Ollama below. Each has its own separate free-tier quota pool from the
// other two, which is the whole point of offering a choice: if Gemini's
// tight 5 requests/minute is exhausted, Groq or OpenRouter still work.
const CLOUD_OPTIONS = [
  { key: "gemini", label: "Gemini (cloud)", provider: { type: "gemini" } },
  { key: "groq", label: "Groq (cloud, fast)", provider: { type: "groq" } },
  { key: "openrouter", label: "OpenRouter (cloud)", provider: { type: "openrouter" } },
];

/**
 * Lets the traveler pick which AI backend generates this trip: Gemini
 * (default), Groq, OpenRouter — all cloud, each with its own quota — or a
 * locally running Ollama model, auto-detected and appended to the list
 * when found (see ollama.js for why detection commonly comes back empty:
 * not running, or blocked by Ollama's own CORS default).
 */
export default function ModelSelector({ value, onChange, disabled }) {
  const [ollamaModels, setOllamaModels] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listOllamaModels().then((models) => {
      if (!cancelled) setOllamaModels(models);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = [
    ...CLOUD_OPTIONS,
    ...ollamaModels.map((m) => ({
      key: `ollama:${m}`,
      label: `Local — ${m}`,
      provider: { type: "ollama", model: m },
    })),
  ];

  const selectedKey =
    value?.type === "ollama" ? `ollama:${value.model}` : value?.type || "gemini";

  return (
    <div className="form-group model-selector">
      <label htmlFor="model-select">AI model</label>
      <select
        id="model-select"
        value={selectedKey}
        onChange={(e) => {
          const opt = options.find((o) => o.key === e.target.value);
          onChange(opt.provider);
        }}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="field-hint">
        Each option has its own separate free usage limit — if one's busy, try another.
        {ollamaModels.length > 0 &&
          " Local models run entirely on your machine — private and free."}
      </span>
    </div>
  );
}
