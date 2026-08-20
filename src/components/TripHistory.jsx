import { getTripHistory, removeTripFromHistory } from "../utils/tripStorage";

export default function TripHistory({ onSelect, onClose, refreshKey, onRefresh }) {
  const history = getTripHistory();

  const handleRemove = (e, tripId) => {
    e.stopPropagation();
    removeTripFromHistory(tripId);
    onRefresh();
  };

  if (history.length === 0) {
    return (
      <div className="trip-history-empty">
        <p>No saved trips yet — generate one and it'll show up here.</p>
        <button className="secondary-btn" onClick={onClose}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="trip-history">
      <div className="trip-history-header">
        <h2>Your trips</h2>
        <button className="secondary-btn" onClick={onClose}>
          Back
        </button>
      </div>
      <div className="trip-history-list">
        {history.map((trip) => (
          <button
            key={trip.id}
            className="trip-history-card"
            onClick={() => onSelect(trip)}
          >
            {trip.heroImage?.thumb && (
              <img
                src={trip.heroImage.thumb}
                alt=""
                className="trip-history-thumb"
              />
            )}
            <div className="trip-history-info">
              <span className="trip-history-destination">
                {trip.input?.destination}
              </span>
              <span className="trip-history-meta">
                {trip.input?.days} days · {trip.input?.pax} traveler
                {trip.input?.pax > 1 ? "s" : ""} ·{" "}
                {trip.input?.currency} {trip.input?.budget?.toLocaleString()}
              </span>
              <span className="trip-history-date">
                {trip.createdAt
                  ? new Date(trip.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : ""}
              </span>
            </div>
            <span
              className="trip-history-remove"
              role="button"
              tabIndex={0}
              onClick={(e) => handleRemove(e, trip.id)}
              aria-label="Remove from history"
            >
              ✕
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}