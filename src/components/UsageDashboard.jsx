import { getTodayUsage, MODEL_LARGE } from "../utils/groq";
import { DAILY_TOKEN_BUDGET } from "../utils/tripStorage";

// Rough tokens-per-full-trip-generation estimate (the one call that matters
// for the daily ceiling — the two small calls run on a separate, much
// higher-capacity pool and aren't the binding constraint).
const APPROX_TOKENS_PER_TRIP = 8500;

export default function UsageDashboard() {
  const usage = getTodayUsage();
  const usedLarge = usage[MODEL_LARGE] || 0;
  const budgetLarge = DAILY_TOKEN_BUDGET[MODEL_LARGE];
  const remainingTokens = Math.max(budgetLarge - usedLarge, 0);
  const approxTripsLeft = Math.max(
    Math.floor(remainingTokens / APPROX_TOKENS_PER_TRIP),
    0
  );
  const percentUsed = Math.min(
    Math.round((usedLarge / budgetLarge) * 100),
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
      title={`${usedLarge.toLocaleString()} / ${budgetLarge.toLocaleString()} tokens used today (estimate)`}
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