export default function TripStub({ input, onReset }) {
  if (!input) return null;

  const { destination, days, pax, budget, currency, flightsIncluded } = input;

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
