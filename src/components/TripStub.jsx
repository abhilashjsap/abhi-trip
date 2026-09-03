function formatDeparture(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const departUtc = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntil = Math.round((departUtc - todayUtc) / 86400000);

  const dateLabel = new Date(departUtc).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

  if (daysUntil === 0) return `${dateLabel} · today`;
  if (daysUntil === 1) return `${dateLabel} · tomorrow`;
  if (daysUntil > 1) return `${dateLabel} · in ${daysUntil} days`;
  return dateLabel;
}

export default function TripStub({ input, onReset }) {
  if (!input) return null;

  const { destination, days, pax, budget, currency, flightsIncluded, departureDate } = input;

  return (
    <div className="trip-stub">
      <div className="stub-main">
        <div className="stub-row">
          <div>
            <span className="stub-label">Destination</span>
            <span className="stub-value stub-destination">{destination}</span>
          </div>
          <div>
            <span className="stub-label">Duration</span>
            <span className="stub-value">{days}D</span>
          </div>
          {departureDate && (
            <div>
              <span className="stub-label">Departs</span>
              <span className="stub-value">{formatDeparture(departureDate)}</span>
            </div>
          )}
        </div>

        <div className="stub-row">
          <div>
            <span className="stub-label">Travelers</span>
            <span className="stub-value">{pax}</span>
          </div>
          <div>
            <span className="stub-label">Budget</span>
            <span className="stub-value">
              {currency} {budget?.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="stub-label">Flights</span>
            <span className="stub-value">
              {flightsIncluded ? "Included" : "Separate"}
            </span>
          </div>
        </div>
      </div>

      {onReset && (
        <div className="stub-tear">
          <button onClick={onReset} className="stub-reset">
            Plan another
          </button>
        </div>
      )}
    </div>
  );
}
