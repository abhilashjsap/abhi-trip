// Pure client-side geometry — no AI call, no network beyond the geocoding
// the caller already does. Used in TripForm to give the user a rough,
// honest "here's what this route costs in time" nudge BEFORE they submit,
// separate from (and never shown alongside) the AI's own post-generation
// interCityLegs estimate, which reflects real typical fares/modes rather
// than straight-line geometry.

const EARTH_RADIUS_KM = 6371;
const GROUND_KMH = 70;
const FLIGHT_KMH = 750;
const FLIGHT_OVERHEAD_HOURS = 1;
const FLIGHT_THRESHOLD_KM = 400;
export const LONG_HAUL_HOURS = 6;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two {lat, lng} points, in kilometers.
 */
export function haversineDistanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Rough mode/duration estimate for a leg between two geocoded points.
 * Deliberately crude — this is a pre-submit nudge, not a booking estimate:
 * under 400km assumes ground transport at a modest average speed (train/bus/
 * car, accounting for stops/borders), 400km+ assumes a flight at typical
 * cruise speed plus a flat hour for airport overhead on each end combined.
 * @returns {{ distanceKm: number, mode: "ground"|"flight", hours: number }}
 */
export function estimateLeg(coordsA, coordsB) {
  const distanceKm = haversineDistanceKm(coordsA, coordsB);

  if (distanceKm < FLIGHT_THRESHOLD_KM) {
    return { distanceKm, mode: "ground", hours: distanceKm / GROUND_KMH };
  }

  return {
    distanceKm,
    mode: "flight",
    hours: distanceKm / FLIGHT_KMH + FLIGHT_OVERHEAD_HOURS,
  };
}
