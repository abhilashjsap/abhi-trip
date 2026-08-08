export default function BudgetWarning({ feasibility, input, onAdjust }) {
  if (!feasibility) return null;

  const { minimumRealisticBudget, currency, reason } = feasibility;

  return (
    <div className="budget-warning">
      <div className="budget-warning-icon" aria-hidden="true">!</div>
      <h2>This budget won't cover the trip</h2>
      <p className="budget-warning-reason">{reason}</p>

      {minimumRealisticBudget != null && (
        <div className="budget-warning-figures">
          <div>
            <span className="budget-warning-label">Your budget</span>
            <span className="budget-warning-value budget-warning-low">
              {input?.currency} {Number(input?.budget).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="budget-warning-label">Realistic minimum</span>
            <span className="budget-warning-value">
              {currency || input?.currency}{" "}
              {Number(minimumRealisticBudget).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <button className="budget-warning-btn" onClick={onAdjust}>
        Adjust my trip details
      </button>
    </div>
  );
}
