export default function TripPlanner({ planner, currency }) {
  if (!planner) return null;

  const { budgetBreakdown = [], tips = [], totalEstimate } = planner;
  const rows = budgetBreakdown.filter((row) => row.amount > 0);

  return (
    <section className="trip-planner">
      <div className="section-heading">
        <span className="section-eyebrow">The numbers</span>
        <h2>Budget breakdown</h2>
      </div>

      <div className="budget-bars">
        {rows.map((row) => (
          <div key={row.category} className="budget-bar-row">
            <div className="budget-bar-label">
              <span>{row.category}</span>
              <span className="budget-bar-amount">
                {currency} {row.amount.toLocaleString()}
              </span>
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
          <span>Total estimate</span>
          <span className="budget-total-amount">
            {currency} {totalEstimate.toLocaleString()}
          </span>
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
