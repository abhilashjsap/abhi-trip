import { getTodayRequestCounts, MODEL_LARGE, MODEL_FALLBACK } from "../utils/gemini";
import { DAILY_REQUEST_LIMIT } from "../utils/tripStorage";

// A single "Generate" click can cost more than one request against the
// daily quota — every retry (including the repetition-loop/incomplete-
// response guards' immediate retries) is a real completed Gemini call, not
// a free do-over. This estimate assumes a normal trip costs ~1.5 requests
// on average (mostly 1, occasionally 2-3 on a rough generation) rather than
// promising a full request-per-trip that a bad run can blow through fast.
const APPROX_REQUESTS_PER_TRIP = 1.5;

export default function UsageDashboard() {
  const requestCounts = getTodayRequestCounts();
  const usedLarge = requestCounts[MODEL_LARGE] || 0;
  const usedFallback = requestCounts[MODEL_FALLBACK] || 0;
  const limitLarge = DAILY_REQUEST_LIMIT[MODEL_LARGE];
  const limitFallback = DAILY_REQUEST_LIMIT[MODEL_FALLBACK];

  // Gemini enforces its quota per model, and generateTripPlan automatically
  // falls back to MODEL_FALLBACK once MODEL_LARGE is exhausted (see
  // gemini.js) — so the real remaining capacity for generating a trip is
  // the sum of both pools, not just the primary model's alone. Without
  // this, the meter would show "0 left" the moment MODEL_LARGE ran out
  // even though a trip could still succeed on the backup model.
  // MODEL_FALLBACK's limit is an unconfirmed placeholder (see
  // tripStorage.js), so this is still an estimate — just a less wrong one
  // than ignoring the fallback pool entirely.
  const remainingLarge = Math.max(limitLarge - usedLarge, 0);
  const remainingFallback = Math.max(limitFallback - usedFallback, 0);
  const totalRemaining = remainingLarge + remainingFallback;
  const totalLimit = limitLarge + limitFallback;
  const totalUsed = usedLarge + usedFallback;

  const approxTripsLeft = Math.max(
    Math.floor(totalRemaining / APPROX_REQUESTS_PER_TRIP),
    0
  );
  const percentUsed = Math.min(
    Math.round((totalUsed / totalLimit) * 100),
    100
  );

  const isLow = approxTripsLeft <= 2;
  const isOut = approxTripsLeft === 0;

  return (
    <div
      className={
        "usage-dashboard" +
        (isOut ? " usage-out" : isLow ? " usage-low" : "")
      }
      title={`${usedLarge}/${limitLarge} used on the main model, ${usedFallback}/${limitFallback} on the backup model today (estimate — retries count too)`}
    >
      <span className="usage-dot" aria-hidden="true" />
      <span className="usage-text">
        {isOut
          ? "Daily limit reached"
          : `~${approxTripsLeft} trip${approxTripsLeft === 1 ? "" : "s"} left today`}
      </span>
      <div className="usage-bar-track">
        <div
          className="usage-bar-fill"
          style={{ width: `${percentUsed}%` }}
        />
      </div>
    </div>
  );
}
