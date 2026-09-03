export default function PracticalInfo({ visaInfo, simInfo, bookInAdvance }) {
  if (!visaInfo && !simInfo) return null;

  return (
    <section className="practical-info-section">
      <div className="section-heading">
        <span className="section-eyebrow">Before you go</span>
        <h2>Practical info</h2>
      </div>

      <div className="practical-info-card">
        {visaInfo && (
          <div className="practical-info-block">
            <span className="practical-info-label">Visa</span>
            <p className="practical-info-status">{visaInfo.status}</p>
            <p>{visaInfo.note}</p>
          </div>
        )}

        {simInfo && (
          <div className="practical-info-block">
            <span className="practical-info-label">Local SIM &amp; connectivity</span>
            <p className="practical-info-status">{simInfo.recommendation}</p>
            <p>{simInfo.note}</p>
          </div>
        )}

        {bookInAdvance?.length > 0 && (
          <div className="practical-info-block">
            <span className="practical-info-label">Book in advance</span>
            <ul>
              {bookInAdvance.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
