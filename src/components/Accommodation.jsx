import RegenerateButton from "./RegenerateButton";

export default function Accommodation({ accommodation, currency, onRegenerate, regenerating }) {
  if (!accommodation) return null;

  const { tier, pricePerNightLow, pricePerNightHigh, unit, areaRecommendation, notes } = accommodation;

  return (
    <section className="accommodation-section">
      <div className="section-heading section-heading-with-action">
        <div>
          <span className="section-eyebrow">Where to stay</span>
          <h2>Hotel tariff</h2>
        </div>
        {onRegenerate && (
          <RegenerateButton onClick={onRegenerate} loading={regenerating} />
        )}
      </div>

      <div className="accommodation-card">
        <span className="accommodation-tier">{tier}</span>
        <div className="accommodation-price">
          {currency} {pricePerNightLow?.toLocaleString()} – {pricePerNightHigh?.toLocaleString()}
          {unit && <span className="accommodation-unit"> {unit}</span>}
        </div>

        {areaRecommendation && (
          <div className="accommodation-area">
            <span className="accommodation-label">Where to look</span>
            <p>{areaRecommendation}</p>
          </div>
        )}

        {notes && <p className="accommodation-notes">{notes}</p>}
      </div>
    </section>
  );
}
