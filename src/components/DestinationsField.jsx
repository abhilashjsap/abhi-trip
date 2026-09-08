import { useEffect, useRef, useState } from "react";
import DestinationAutocomplete from "./DestinationAutocomplete";
import { geocodeDestination } from "../utils/geocoding";
import { estimateLeg, LONG_HAUL_HOURS } from "../utils/transferEstimate";

const MAX_DESTINATIONS = 4;
// Same pacing geocodeAttractions already uses — Nominatim's usage policy
// caps free public use at ~1 request/sec.
const GEOCODE_DELAY_MS = 1100;

/**
 * Manages the trip's destination list. With exactly one destination this
 * renders the classic single-field look (unchanged from before this
 * feature existed) plus a small "add another" link. Once there are 2+, it
 * switches to a chip list with a per-stop day stepper, reorder arrows, and
 * a live inter-city leg estimate — pure client-side geometry (see
 * transferEstimate.js), never an AI call, so it's instant and free. This is
 * a nudge only: it's never shown alongside the AI's own post-generation
 * interCityLegs answer, and never blocks submission.
 */
export default function DestinationsField({ destinations, onChange, disabled, onLegsChange }) {
  const [legs, setLegs] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const coordsCacheRef = useRef(new Map());

  const isMulti = destinations.length > 1;
  const names = destinations.map((d) => d.name.trim()).filter(Boolean);
  const namesKey = JSON.stringify(names);

  useEffect(() => {
    if (!isMulti || names.length < 2) {
      setLegs([]);
      onLegsChange?.([]);
      return;
    }

    let cancelled = false;
    setGeocoding(true);

    (async () => {
      const cache = coordsCacheRef.current;
      const coordsList = [];
      for (const name of names) {
        if (cancelled) return;
        if (!cache.has(name)) {
          const coords = await geocodeDestination(name);
          if (cancelled) return;
          cache.set(name, coords);
          await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS));
        }
        coordsList.push(cache.get(name));
      }
      if (cancelled) return;

      const computedLegs = [];
      for (let i = 0; i < coordsList.length - 1; i++) {
        const a = coordsList[i];
        const b = coordsList[i + 1];
        if (!a || !b) continue;
        computedLegs.push({ from: names[i], to: names[i + 1], ...estimateLeg(a, b) });
      }
      setLegs(computedLegs);
      onLegsChange?.(computedLegs);
      setGeocoding(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, isMulti]);

  const updateDestination = (idx, patch) => {
    onChange(destinations.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const addDestination = () => {
    if (destinations.length >= MAX_DESTINATIONS) return;
    onChange([...destinations, { name: "", days: 2 }]);
  };

  const removeDestination = (idx) => {
    onChange(destinations.filter((_, i) => i !== idx));
  };

  const moveDestination = (idx, dir) => {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= destinations.length) return;
    const next = [...destinations];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange(next);
  };

  const adjustDays = (idx, delta) => {
    const current = Number(destinations[idx].days) || 1;
    updateDestination(idx, { days: Math.max(1, current + delta) });
  };

  if (!isMulti) {
    return (
      <>
        <DestinationAutocomplete
          id="destination"
          label="Destination"
          placeholder="e.g. Goa, India"
          value={destinations[0]?.name || ""}
          onChange={(value) => updateDestination(0, { name: value })}
          disabled={disabled}
        />
        <button
          type="button"
          className="add-destination-link"
          onClick={addDestination}
          disabled={disabled}
        >
          + Add another destination
        </button>
      </>
    );
  }

  const totalDays = destinations.reduce((sum, d) => sum + (Number(d.days) || 0), 0);

  return (
    <div className="form-group destinations-field">
      <label>Destinations</label>

      <div className="destination-chip-list">
        {destinations.map((d, idx) => (
          <div key={idx} className="destination-chip">
            <div className="destination-chip-reorder">
              <button
                type="button"
                onClick={() => moveDestination(idx, -1)}
                disabled={disabled || idx === 0}
                aria-label="Move earlier in the route"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveDestination(idx, 1)}
                disabled={disabled || idx === destinations.length - 1}
                aria-label="Move later in the route"
              >
                ▼
              </button>
            </div>

            <input
              type="text"
              className="destination-chip-name"
              value={d.name}
              onChange={(e) => updateDestination(idx, { name: e.target.value })}
              placeholder="e.g. Singapore"
              disabled={disabled}
            />

            <div className="destination-chip-days">
              <button
                type="button"
                onClick={() => adjustDays(idx, -1)}
                disabled={disabled || Number(d.days) <= 1}
                aria-label="Fewer days"
              >
                −
              </button>
              <span>{d.days}d</span>
              <button type="button" onClick={() => adjustDays(idx, 1)} disabled={disabled} aria-label="More days">
                +
              </button>
            </div>

            <button
              type="button"
              className="destination-chip-remove"
              onClick={() => removeDestination(idx)}
              disabled={disabled}
              aria-label={`Remove ${d.name || "this destination"}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="add-destination-link"
        onClick={addDestination}
        disabled={disabled || destinations.length >= MAX_DESTINATIONS}
      >
        {destinations.length >= MAX_DESTINATIONS ? "Up to 4 stops" : "+ Add another destination"}
      </button>

      <span className="destinations-total">
        Total: {totalDays} day{totalDays === 1 ? "" : "s"} across {destinations.length} stops
      </span>

      {geocoding && <p className="leg-estimate-status">Estimating travel between stops…</p>}

      {legs.length > 0 && (
        <div className="leg-estimate-list">
          {legs.map((leg, idx) => (
            <div
              key={idx}
              className={"leg-estimate" + (leg.hours >= LONG_HAUL_HOURS ? " leg-estimate-longhaul" : "")}
            >
              <span className="leg-estimate-route">
                {leg.from} → {leg.to}
              </span>
              <span className="leg-estimate-detail">
                ~{Math.round(leg.hours)}h by {leg.mode === "flight" ? "flight" : "ground transport"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
