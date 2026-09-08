import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { geocodeAttractions } from "../utils/geocoding";
import logger from "../utils/logger";

// Caps how many attractions get geocoded PER destination (not overall) —
// Nominatim's free public usage policy is a strict ~1 request/sec, enforced
// sequentially, so a 4-stop trip geocoding every attraction from every stop
// could take 30s+. Capping bounds the worst case to a predictable ~18s
// while still showing a representative spread of pins per stop.
const MAX_PINS_PER_DESTINATION = 4;

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [30, 30] });
    } else if (positions.length === 1) {
      map.setView(positions[0], 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(positions)]);
  return null;
}

// Vite (like most bundlers) breaks Leaflet's default marker icon path
// resolution — this is the standard fix, pointing the default icon at the
// actual bundled asset URLs instead.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function AttractionsMap({ attractions, destination }) {
  const [pins, setPins] = useState(null);
  const [loading, setLoading] = useState(true);

  // Group by each attraction's own destination when present (multi-stop),
  // falling back to the shared `destination` prop otherwise (single-stop —
  // this always collapses to one group, so the cap below never applies and
  // behavior matches today's exactly).
  const groups = new Map();
  for (const a of attractions || []) {
    const key = a.destination || destination || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const isMultiDestination = groups.size > 1;
  const toGeocode = isMultiDestination
    ? [...groups.values()].flatMap((group) => group.slice(0, MAX_PINS_PER_DESTINATION))
    : attractions || [];

  useEffect(() => {
    if (!toGeocode.length) {
      setPins(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    geocodeAttractions(toGeocode, destination)
      .then((results) => {
        if (!cancelled) setPins(results);
      })
      .catch((err) => {
        logger.debug("Failed to geocode attractions for map:", err);
        if (!cancelled) setPins([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-geocode only when the actual set of attractions changes, not on
    // every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, JSON.stringify(toGeocode.map((a) => `${a.name}|${a.destination || ""}`))]);

  if (!attractions?.length) return null;

  const located = (pins || [])
    .map((pin, idx) => (pin ? { ...pin, attraction: toGeocode[idx] } : null))
    .filter(Boolean);

  // One representative point per destination (centroid of its own located
  // pins), in trip order — used for the route line on a multi-stop map
  // instead of the raw attraction-list-order line (which would otherwise
  // zigzag between cities rather than showing the actual route).
  const routePoints = isMultiDestination
    ? [...groups.keys()]
        .map((key) => {
          const pinsForKey = located.filter((p) => (p.attraction.destination || destination || "") === key);
          if (!pinsForKey.length) return null;
          const lat = pinsForKey.reduce((sum, p) => sum + p.lat, 0) / pinsForKey.length;
          const lng = pinsForKey.reduce((sum, p) => sum + p.lng, 0) / pinsForKey.length;
          return [lat, lng];
        })
        .filter(Boolean)
    : [];

  return (
    <section className="attractions-map-section">
      <div className="section-heading">
        <span className="section-eyebrow">On the map</span>
        <h2>Where things are</h2>
      </div>

      {loading && (
        <p className="map-status">Placing pins on the map…</p>
      )}

      {!loading && located.length === 0 && (
        <p className="map-status">Couldn't place any pins for this trip.</p>
      )}

      {located.length > 0 && (
        <div className="attractions-map">
          <MapContainer
            center={[located[0].lat, located[0].lng]}
            zoom={12}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <FitBounds positions={located.map(({ lat, lng }) => [lat, lng])} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {isMultiDestination ? (
              routePoints.length > 1 && (
                <Polyline
                  positions={routePoints}
                  pathOptions={{ color: "#B8543A", weight: 3, opacity: 0.55, dashArray: "6 8" }}
                />
              )
            ) : (
              located.length > 1 && (
                // A rough path through the attractions in the order the AI
                // listed them — not a guaranteed itinerary-day sequence, just
                // enough to give a sense of how spread out the trip is.
                <Polyline
                  positions={located.map(({ lat, lng }) => [lat, lng])}
                  pathOptions={{ color: "#B8543A", weight: 3, opacity: 0.55, dashArray: "6 8" }}
                />
              )
            )}
            {located.map(({ lat, lng, attraction }, idx) => (
              <Marker key={idx} position={[lat, lng]}>
                <Popup>{attraction.name}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </section>
  );
}
