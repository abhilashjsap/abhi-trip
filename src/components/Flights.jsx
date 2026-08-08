export default function Flights({ flights, currency }) {
  if (!flights) return null;

  const { departureCity, destination, outbound, returnFlight, bookingTip } = flights;

  const renderLeg = (leg, label) => {
    if (!leg) return null;
    return (
      <div className="flight-leg">
        <span className="flight-leg-label">{label}</span>
        <span className="flight-leg-price">
          {currency} {leg.priceRangeLow?.toLocaleString()} – {leg.priceRangeHigh?.toLocaleString()}
        </span>
        {leg.typicalAirlines?.length > 0 && (
          <span className="flight-leg-airlines">
            {leg.typicalAirlines.join(" · ")}
          </span>
        )}
        {leg.notes && <p className="flight-leg-notes">{leg.notes}</p>}
      </div>
    );
  };

  return (
    <section className="flights">
      <div className="section-heading">
        <span className="section-eyebrow">Getting there</span>
        <h2>Flight estimates</h2>
      </div>

      <div className="flights-card">
        <div className="flights-route">
          <span>{departureCity}</span>
          <span className="flights-route-arrow">→</span>
          <span>{destination}</span>
        </div>

        <div className="flights-legs">
          {renderLeg(outbound, "Outbound")}
          {renderLeg(returnFlight, "Return")}
        </div>

        {bookingTip && <p className="flights-tip">{bookingTip}</p>}

        <p className="flights-disclaimer">
          These are typical fare estimates, not live prices. Check an airline
          or booking site closer to your travel dates for actual fares.
        </p>
      </div>
    </section>
  );
}
