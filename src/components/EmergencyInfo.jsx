import RegenerateButton from "./RegenerateButton";

export default function EmergencyInfo({ emergencyInfo, onRegenerate, regenerating }) {
  if (!emergencyInfo?.generalEmergencyNumber) return null;

  const { generalEmergencyNumber, embassyNote } = emergencyInfo;

  return (
    <section className="emergency-section">
      <div className="section-heading section-heading-with-action">
        <div>
          <span className="section-eyebrow">Just in case</span>
          <h2>Emergency info</h2>
        </div>
        {onRegenerate && (
          <RegenerateButton onClick={onRegenerate} loading={regenerating} />
        )}
      </div>

      <div className="emergency-card">
        <div className="emergency-number-row">
          <span className="emergency-number-label">Emergency number</span>
          <span className="emergency-number-value">{generalEmergencyNumber}</span>
        </div>
        {embassyNote && (
          <div className="emergency-embassy">
            <span className="emergency-embassy-label">Embassy &amp; consulate</span>
            <p>{embassyNote}</p>
          </div>
        )}
      </div>
    </section>
  );
}
