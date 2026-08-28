/**
 * Uploads a trip to the server (api/share.js, backed by Upstash Redis) and
 * returns a short id. The trip is stored for 90 days.
 * @param {Object} trip
 * @returns {Promise<string>} the share id
 */
export async function shareTrip(trip) {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trip }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.id) {
    throw new Error(data?.error || "Couldn't create a share link. Please try again.");
  }

  return data.id;
}

/**
 * Fetches a previously-shared trip by id.
 * @param {string} id
 * @returns {Promise<Object>} the trip
 */
export async function loadSharedTrip(id) {
  const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.trip) {
    throw new Error(data?.error || "Couldn't load this shared trip.");
  }

  return data.trip;
}
