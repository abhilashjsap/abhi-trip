import RegenerateButton from "./RegenerateButton";

export default function BewareOf({ bewareOf, onRegenerate, regenerating }) {
  if (!bewareOf?.length) return null;

  return (
    <section className="beware-section">
      <div className="section-heading section-heading-with-action">
        <div>
          <span className="section-eyebrow">Stay sharp</span>
          <h2>Beware of</h2>
        </div>
        {onRegenerate && (
          <RegenerateButton onClick={onRegenerate} loading={regenerating} />
        )}
      </div>

      <div className="beware-list">
        {bewareOf.map((item, idx) => (
          <div key={idx} className="beware-item">
            <h4>{item.title}</h4>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
