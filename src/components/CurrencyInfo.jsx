const RECOMMENDATION_LABELS = {
  "carry-cash": "Carry cash in your home currency",
  "get-local-currency": "Get local currency before/on arrival",
  "card-friendly": "Cards work fine here",
};

/**
 * Formats the exchange rate line so the LOWER-VALUE currency always sits on
 * the right of "=". We're given "how many units of local currency per 1 unit
 * of input currency" as a plain number (rate). If rate > 1, the local
 * currency is worth LESS per unit than the input currency, e.g.
 * 1 INR = 18 MYR-equivalent — wait, actually rate > 1 means you need MORE
 * local units to equal 1 input unit, so the local currency is the
 * lower-value one and belongs on the right as-is: "1 INR = 18 MYR".
 * If rate < 1, the local currency is worth MORE per unit (e.g. 1 INR =
 * 0.0067 KWD) — input currency is then the lower-value one, so we flip the
 * expression to put INR on the right: "1 KWD = 149.25 INR".
 */
function formatExchangeRate({ rate, inputCurrency, localCode }) {
  if (!Number.isFinite(rate) || rate <= 0) return null;

  if (rate >= 1) {
    // Local currency needs more units to match 1 input unit -> local is
    // the lower-value currency -> stays on the right.
    const formatted = rate >= 100 ? Math.round(rate).toLocaleString() : rate.toFixed(2);
    return `1 ${inputCurrency} = ${formatted} ${localCode}`;
  }

  // rate < 1: local currency is worth MORE than the input currency, so the
  // input currency is lower-value -> move it to the right instead.
  const flipped = 1 / rate;
  const formatted = flipped >= 100 ? Math.round(flipped).toLocaleString() : flipped.toFixed(2);
  return `1 ${localCode} = ${formatted} ${inputCurrency}`;
}

export default function CurrencyInfo({ currencyInfo, currency }) {
  if (!currencyInfo || !currencyInfo.isForeign) return null;

  const {
    localCurrencyName,
    localCurrencyCode,
    oneUnitOfInputCurrencyInLocal,
    exchangeRateNote,
    recommendation,
    recommendationReason,
    airportExchangeWarning,
    betterExchangeOptions = [],
    cardTips,
  } = currencyInfo;

  const rateLine = formatExchangeRate({
    rate: Number(oneUnitOfInputCurrencyInLocal),
    inputCurrency: currency,
    localCode: localCurrencyCode,
  });

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
          {rateLine && (
            <div>
              <span className="currency-label">Approx. rate</span>
              <span className="currency-value currency-rate">
                {rateLine}
                {exchangeRateNote ? ` (${exchangeRateNote})` : ""}
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