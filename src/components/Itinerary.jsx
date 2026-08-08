export default function Itinerary({ itinerary }) {
  if (!itinerary?.length) return null;

  return (
    <section className="itinerary">
      <div className="section-heading">
        <span className="section-eyebrow">The plan</span>
        <h2>Day by day</h2>
      </div>

      <div className="timeline">
        {itinerary.map((day) => (
          <div key={day.day} className="timeline-day">
            <div className="timeline-marker">
              <span className="timeline-day-num">{String(day.day).padStart(2, "0")}</span>
            </div>
            <div className="timeline-content">
              <h3>{day.title || `Day ${day.day}`}</h3>
              <ul>
                {day.activities?.map((act, idx) => (
                  <li key={idx}>
                    <span className="activity-time">{act.time}</span>
                    <span className="activity-body">
                      {act.activity}
                      {act.notes && <em className="activity-note"> — {act.notes}</em>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
