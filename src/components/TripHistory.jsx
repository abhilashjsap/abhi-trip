import { useEffect, useState } from "react";
import { fetchTrips, removeTripFromHistory } from "../utils/tripStorage";

export default function TripHistory({ onSelect, onClose, onRefresh }) {
  const [history, setHistory] = useState(null); // null = still loading
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTrips().then(({ trips }) => {
      if (!cancelled) setHistory(trips);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRemove = async (e, tripId) => {
    e.stopPropagation();
    setError("");
    try {
      await removeTripFromHistory(tripId);
    } catch (err) {
      setError(err.message || "Couldn't remove that trip. Please try again.");
    }
    onRefresh();
  };

  if (history === null) {
    return (
      <div className="trip-history-empty">
        <p>Loading your trips...</p>
      </div>
    );
  }

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
      {error && <p className="form-error">{error}</p>}
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
                {trip.input?.destinationLabel || trip.input?.destination}
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
