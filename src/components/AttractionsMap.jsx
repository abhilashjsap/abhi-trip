import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { geocodeAttractions } from "../utils/geocoding";
import logger from "../utils/logger";

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

  useEffect(() => {
    if (!attractions?.length || !destination) {
      setPins(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    geocodeAttractions(attractions, destination)
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
  }, [destination, JSON.stringify((attractions || []).map((a) => a.name))]);

  if (!attractions?.length) return null;

  const located = (pins || [])
    .map((pin, idx) => (pin ? { ...pin, attraction: attractions[idx] } : null))
    .filter(Boolean);

  return (
    <section className="attractions-map-section" data-html2canvas-ignore="true">
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
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
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
