import { useEffect, useState } from "react";
import { listOllamaModels } from "../utils/ollama";

/**
 * Lets the traveler pick Gemini (cloud, default) or a locally running Ollama
 * model for this trip's generation. Stays hidden entirely when no local
 * models are detected, since Ollama detection commonly comes back empty
 * (not running, or blocked by Ollama's own CORS default — see ollama.js) and
 * the common case shouldn't show a picker with only one real option.
 */
export default function ModelSelector({ value, onChange, disabled }) {
  const [ollamaModels, setOllamaModels] = useState([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listOllamaModels().then((models) => {
      if (!cancelled) {
        setOllamaModels(models);
        setChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || ollamaModels.length === 0) return null;

  const options = [
    { key: "gemini", label: "Gemini (cloud)", provider: { type: "gemini" } },
    ...ollamaModels.map((m) => ({
      key: `ollama:${m}`,
      label: `Local — ${m}`,
      provider: { type: "ollama", model: m },
    })),
  ];

  const selectedKey = value?.type === "ollama" ? `ollama:${value.model}` : "gemini";

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
        Local models run entirely on your machine — private, free, and don't count against the daily Gemini limit.
      </span>
    </div>
  );
}
