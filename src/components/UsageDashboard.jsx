import { getTodayRequestCounts, MODEL_LARGE } from "../utils/gemini";
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
  const limitLarge = DAILY_REQUEST_LIMIT[MODEL_LARGE];
  const remainingRequests = Math.max(limitLarge - usedLarge, 0);
  const approxTripsLeft = Math.max(
    Math.floor(remainingRequests / APPROX_REQUESTS_PER_TRIP),
    0
  );
  const percentUsed = Math.min(
    Math.round((usedLarge / limitLarge) * 100),
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
      title={`${usedLarge} / ${limitLarge} requests used today (estimate — retries count too)`}
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
