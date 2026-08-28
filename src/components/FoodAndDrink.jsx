import RegenerateButton from "./RegenerateButton";

export default function FoodAndDrink({ food, currency, onRegenerate, regenerating }) {
  if (!food) return null;

  const { dishes = [], beverages = [], mealCostEstimate } = food;

  return (
    <section className="food-section">
      <div className="section-heading section-heading-with-action">
        <div>
          <span className="section-eyebrow">Eat & drink</span>
          <h2>Local food to try</h2>
        </div>
        {onRegenerate && (
          <RegenerateButton onClick={onRegenerate} loading={regenerating} />
        )}
      </div>

      {dishes.length > 0 && (
        <div className="dish-grid">
          {dishes.map((dish, idx) => (
            <div key={idx} className="dish-card">
              <span className="dish-type">{dish.type}</span>
              <h4>{dish.name}</h4>
              <p>{dish.description}</p>
            </div>
          ))}
        </div>
      )}

      {beverages.length > 0 && (
        <div className="beverage-row">
          <h4>Drink</h4>
          <div className="beverage-tags">
            {beverages.map((bev, idx) => (
              <span key={idx} className="beverage-tag" title={bev.description}>
                {bev.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {mealCostEstimate && (
        <div className="meal-cost">
          <h4>Approx. cost per person, per meal</h4>
          <div className="meal-cost-grid">
            {["breakfast", "lunch", "dinner"].map((meal) => {
              const data = mealCostEstimate[meal];
              if (!data) return null;
              return (
                <div key={meal} className="meal-cost-item">
                  <span className="meal-name">{meal}</span>
                  <span className="meal-price">
                    {currency} {data.budget?.toLocaleString()} – {data.midRange?.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
          {mealCostEstimate.notes && (
            <p className="meal-cost-notes">{mealCostEstimate.notes}</p>
          )}
        </div>
      )}
    </section>
  );
}
