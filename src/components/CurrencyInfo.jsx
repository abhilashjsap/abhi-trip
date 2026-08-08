const RECOMMENDATION_LABELS = {
  "carry-cash": "Carry cash in your home currency",
  "get-local-currency": "Get local currency before/on arrival",
  "card-friendly": "Cards work fine here",
};

export default function CurrencyInfo({ currencyInfo, currency }) {
  if (!currencyInfo || !currencyInfo.isForeign) return null;

  const {
    localCurrencyName,
    localCurrencyCode,
    approxExchangeRate,
    recommendation,
    recommendationReason,
    airportExchangeWarning,
    betterExchangeOptions = [],
    cardTips,
  } = currencyInfo;

  return (
    <section className="currency-section">
      <div className="section-heading">
        <span className="section-eyebrow">Money matters</span>
        <h2>Currency &amp; exchange</h2>
      </div>

      <div className="currency-card">
        <div className="currency-rate-row">
          <div>
            <span className="currency-label">Local currency</span>
            <span className="currency-value">
              {localCurrencyName}
              {localCurrencyCode ? ` (${localCurrencyCode})` : ""}
            </span>
          </div>
          {approxExchangeRate && (
            <div>
              <span className="currency-label">Approx. rate</span>
              <span className="currency-value currency-rate">
                {approxExchangeRate}
              </span>
            </div>
          )}
        </div>

        {recommendation && (
          <div className="currency-recommendation">
            <span className="currency-rec-badge">
              {RECOMMENDATION_LABELS[recommendation] || recommendation}
            </span>
            {recommendationReason && <p>{recommendationReason}</p>}
          </div>
        )}

        {airportExchangeWarning && (
          <div className="currency-warning">
            <span className="currency-warning-label">Airport exchange</span>
            <p>{airportExchangeWarning}</p>
          </div>
        )}

        {betterExchangeOptions.length > 0 && (
          <div className="currency-options">
            <span className="currency-label">Better places to exchange</span>
            <ul>
              {betterExchangeOptions.map((opt, idx) => (
                <li key={idx}>{opt}</li>
              ))}
            </ul>
          </div>
        )}

        {cardTips && (
          <div className="currency-card-tips">
            <span className="currency-label">Card tips</span>
            <p>{cardTips}</p>
          </div>
        )}
      </div>
    </section>
  );
}
