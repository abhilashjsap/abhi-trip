const CATEGORY_LABELS = {
  clothing: "Clothing",
  documents: "Documents",
  electronics: "Electronics",
  toiletries: "Toiletries",
  misc: "Miscellaneous",
};

export default function PackingList({ packingList }) {
  if (!packingList) return null;

  const categories = Object.keys(packingList).filter(
    (key) => packingList[key]?.length
  );

  if (!categories.length) return null;

  return (
    <section className="packing-list">
      <div className="section-heading">
        <span className="section-eyebrow">Before you go</span>
        <h2>Packing list</h2>
      </div>
      <div className="packing-grid">
        {categories.map((category) => (
          <div key={category} className="packing-category">
            <h4>{CATEGORY_LABELS[category] || category}</h4>
            <ul>
              {packingList[category].map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
