import { useEffect, useState } from "react";
import RegenerateButton from "./RegenerateButton";
import { getLiveForecast } from "../utils/weatherForecast";
import logger from "../utils/logger";

const RATING_LABELS = {
  best: "Best",
  good: "Good",
  okay: "Okay",
  avoid: "Avoid",
};

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "short" });

export default function Weather({ weather, destination, onRegenerate, regenerating }) {
  const [forecast, setForecast] = useState(null);

  useEffect(() => {
    if (!destination) {
      setForecast(null);
      return;
    }

    let cancelled = false;
    getLiveForecast(destination)
      .then((result) => {
        if (!cancelled) setForecast(result);
      })
      .catch((err) => {
        logger.debug("Live forecast fetch failed:", err);
        if (!cancelled) setForecast(null);
      });

    return () => {
      cancelled = true;
    };
  }, [destination]);

  if (!weather?.months?.length) return null;

  const { months, bestMonthsSummary, avoidMonthsSummary } = weather;

  return (
    <section className="weather-section">
      <div className="section-heading section-heading-with-action">
        <div>
          <span className="section-eyebrow">When to go</span>
          <h2>Weather by month</h2>
        </div>
        {onRegenerate && (
          <RegenerateButton onClick={onRegenerate} loading={regenerating} />
        )}
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

      {forecast?.length > 0 && (
        <div className="weather-live-forecast">
          <span className="weather-summary-label">Live forecast (next {forecast.length} days)</span>
          <div className="weather-live-strip">
            {forecast.map((d) => (
              <div key={d.date} className="weather-live-day">
                <span className="weather-live-day-label">
                  {DAY_LABEL_FORMATTER.format(new Date(d.date))}
                </span>
                <span className="weather-live-temps">
                  {d.maxC}° / {d.minC}°
                </span>
                <span className="weather-live-condition">{d.condition}</span>
                {d.precipProbability != null && (
                  <span className="weather-live-precip">{d.precipProbability}% rain</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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