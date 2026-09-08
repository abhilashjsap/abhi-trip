const MODE_LABELS = {
  flight: "Flight",
  train: "Train",
  bus: "Bus",
  ferry: "Ferry",
  car: "Car",
};

/**
 * The AI's real per-leg transport estimate for a multi-stop trip — distinct
 * from (and never shown alongside) TripForm's pre-submit geometric nudge in
 * DestinationsField.jsx, which is pure distance-based guessing done before
 * generation even starts.
 */
export default function InterCityLegs({ legs, currency }) {
  if (!legs?.length) return null;

  return (
    <section className="intercity-legs">
      <div className="section-heading">
        <span className="section-eyebrow">Getting between stops</span>
        <h2>Inter-city transport</h2>
      </div>

      <div className="intercity-legs-list">
        {legs.map((leg, idx) => (
          <div key={idx} className="intercity-leg-card">
            <div className="intercity-leg-route">
              <span>{leg.from}</span>
              <span className="intercity-leg-arrow">→</span>
              <span>{leg.to}</span>
            </div>
            <div className="intercity-leg-meta">
              <span className="intercity-leg-mode">{MODE_LABELS[leg.mode] || leg.mode}</span>
              {leg.typicalDurationHours != null && (
                <span className="intercity-leg-duration">~{leg.typicalDurationHours}h</span>
              )}
              <span className="intercity-leg-price">
                {currency} {leg.priceRangeLow?.toLocaleString()} – {leg.priceRangeHigh?.toLocaleString()}
              </span>
            </div>
            {leg.notes && <p className="intercity-leg-notes">{leg.notes}</p>}
          </div>
        ))}
      </div>

      <p className="intercity-legs-disclaimer">
        These are typical fare/duration estimates, not live prices — check an
        airline, rail, or bus operator closer to your travel dates.
      </p>
    </section>
  );
}
