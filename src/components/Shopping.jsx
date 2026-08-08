export default function Shopping({ shopping }) {
  if (!shopping?.length) return null;

  return (
    <section className="shopping-section">
      <div className="section-heading">
        <span className="section-eyebrow">Take home</span>
        <h2>What to buy</h2>
      </div>

      <div className="shopping-list">
        {shopping.map((item, idx) => (
          <div key={idx} className="shopping-item">
            <div className="shopping-item-header">
              <h4>{item.item}</h4>
              {item.priceRange && (
                <span className="shopping-price">{item.priceRange}</span>
              )}
            </div>
            <p>{item.description}</p>
            {item.whereToBuy && (
              <span className="shopping-where">Where: {item.whereToBuy}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
