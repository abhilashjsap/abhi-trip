export default function Phrasebook({ phrasebook }) {
  if (!phrasebook?.length) return null;

  return (
    <section className="phrasebook-section">
      <div className="section-heading">
        <span className="section-eyebrow">Speak a little local</span>
        <h2>Useful phrases</h2>
      </div>

      <div className="phrasebook-list">
        {phrasebook.map((entry, idx) => (
          <div key={idx} className="phrasebook-item">
            <span className="phrasebook-english">{entry.phrase}</span>
            <span className="phrasebook-translation">{entry.translation}</span>
            <span className="phrasebook-pronunciation">{entry.pronunciation}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
