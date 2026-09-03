import { useState } from "react";

export default function TripPlanner({ planner, currency, pax, currencyInfo }) {
  const [perPerson, setPerPerson] = useState(false);
  const [showLocal, setShowLocal] = useState(false);

  if (!planner) return null;

  const { budgetBreakdown = [], tips = [], totalEstimate } = planner;
  const rows = budgetBreakdown.filter((row) => row.amount > 0);
  const showToggle = pax > 1;
  const divisor = showToggle && perPerson ? pax : 1;

  const rate = currencyInfo?.isForeign ? Number(currencyInfo.oneUnitOfInputCurrencyInLocal) : null;
  const localCode = currencyInfo?.localCurrencyCode;
  const canShowLocal = rate != null && Number.isFinite(rate) && rate > 0 && !!localCode;

  const formatAmount = (amount) => {
    const displayed = amount / divisor;
    const primary = `${currency} ${Math.round(displayed).toLocaleString()}`;
    if (!showLocal || !canShowLocal) return primary;
    const local = Math.round(displayed * rate).toLocaleString();
    return (
      <>
        {primary}
        <span className="budget-amount-local"> ≈ {local} {localCode}</span>
      </>
    );
  };

  return (
    <section className="trip-planner">
      <div className="section-heading section-heading-with-action">
        <div>
          <span className="section-eyebrow">The numbers</span>
          <h2>Budget breakdown</h2>
        </div>
        <div className="budget-controls">
          {canShowLocal && (
            <label className="budget-local-toggle">
              <input
                type="checkbox"
                checked={showLocal}
                onChange={(e) => setShowLocal(e.target.checked)}
              />
              Also show in {localCode}
            </label>
          )}
          {showToggle && (
            <div className="budget-per-person-toggle" role="group" aria-label="Show costs as">
              <button
                type="button"
                className={!perPerson ? "active" : ""}
                onClick={() => setPerPerson(false)}
              >
                Total
              </button>
              <button
                type="button"
                className={perPerson ? "active" : ""}
                onClick={() => setPerPerson(true)}
              >
                Per person
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="budget-bars">
        {rows.map((row) => (
          <div key={row.category} className="budget-bar-row">
            <div className="budget-bar-label">
              <span>{row.category}</span>
              <span className="budget-bar-amount">{formatAmount(row.amount)}</span>
            </div>
            <div className="budget-bar-track">
              <div
                className="budget-bar-fill"
                style={{ width: `${Math.min(row.percentage, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {totalEstimate != null && (
        <div className="budget-total">
          <span>{perPerson && showToggle ? "Total estimate (per person)" : "Total estimate"}</span>
          <span className="budget-total-amount">{formatAmount(totalEstimate)}</span>
        </div>
      )}

      {tips.length > 0 && (
        <div className="tips-block">
          <h3>Tips</h3>
          <ul className="tips-list">
            {tips.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
