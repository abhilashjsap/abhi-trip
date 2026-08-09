const RATING_LABELS = {
  best: "Best",
  good: "Good",
  okay: "Okay",
  avoid: "Avoid",
};

export default function Weather({ weather }) {
  if (!weather?.months?.length) return null;

  const { months, bestMonthsSummary, avoidMonthsSummary } = weather;

  return (
    <section className="weather-section">
      <div className="section-heading">
        <span className="section-eyebrow">When to go</span>
        <h2>Weather by month</h2>
      </div>

      <div className="weather-summary">
        {bestMonthsSummary && (
          <div className="weather-summary-line weather-summary-best">
            <span className="weather-summary-label">Best time</span>
            <p>{bestMonthsSummary}</p>
          </div>
        )}
        {avoidMonthsSummary && (
          <div className="weather-summary-line weather-summary-avoid">
            <span className="weather-summary-label">Avoid</span>
            <p>{avoidMonthsSummary}</p>
          </div>
        )}
      </div>

      <div className="weather-grid">
        {months.map((m) => (
          <div key={m.month} className={`weather-month weather-${m.rating}`}>
            <div className="weather-month-header">
              <span className="weather-month-name">{m.month.slice(0, 3)}</span>
              <span className={`weather-rating-badge weather-rating-${m.rating}`}>
                {RATING_LABELS[m.rating] || m.rating}
              </span>
            </div>
            <div className="weather-temps">
              <span className="weather-temp-high">{m.avgHighC}°</span>
              <span className="weather-temp-low">{m.avgLowC}°</span>
            </div>
            {m.conditions && (
              <p className="weather-conditions">{m.conditions}</p>
            )}
            {m.bestFor && (
              <p className="weather-best-for">
                <span className="weather-best-for-label">Best for</span>
                {m.bestFor}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="weather-disclaimer">
        Based on typical historical seasonal averages — not a live forecast.
      </p>
    </section>
  );
}