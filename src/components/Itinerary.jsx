import { useState } from "react";

export default function Itinerary({ itinerary, onUpdateItinerary }) {
  const [editing, setEditing] = useState(null); // { dayIdx, actIdx } or null
  const [draft, setDraft] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  if (!itinerary?.length) return null;

  const editable = typeof onUpdateItinerary === "function";

  const startEdit = (dayIdx, actIdx, activity) => {
    setEditing({ dayIdx, actIdx });
    setDraft(activity.activity || "");
    setDraftNotes(activity.notes || "");
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
    setDraftNotes("");
  };

  const saveEdit = () => {
    const next = itinerary.map((day, dIdx) => {
      if (dIdx !== editing.dayIdx) return day;
      return {
        ...day,
        activities: day.activities.map((act, aIdx) =>
          aIdx !== editing.actIdx
            ? act
            : { ...act, activity: draft, notes: draftNotes }
        ),
      };
    });
    onUpdateItinerary(next);
    cancelEdit();
  };

  const removeActivity = (dayIdx, actIdx) => {
    const next = itinerary.map((day, dIdx) => {
      if (dIdx !== dayIdx) return day;
      return {
        ...day,
        activities: day.activities.filter((_, aIdx) => aIdx !== actIdx),
      };
    });
    onUpdateItinerary(next);
  };

  return (
    <section className="itinerary">
      <div className="section-heading">
        <span className="section-eyebrow">The plan</span>
        <h2>Day by day</h2>
        {editable && (
          <span className="section-hint">Tap an activity to edit or remove it</span>
        )}
      </div>

      <div className="timeline">
        {itinerary.map((day, dayIdx) => (
          <div key={day.day} className="timeline-day">
            <div className="timeline-marker">
              <span className="timeline-day-num">{String(day.day).padStart(2, "0")}</span>
            </div>
            <div className="timeline-content">
              <h3>{day.title || `Day ${day.day}`}</h3>
              <ul>
                {day.activities?.map((act, actIdx) => {
                  const isEditing =
                    editing?.dayIdx === dayIdx && editing?.actIdx === actIdx;

                  if (isEditing) {
                    return (
                      <li key={actIdx} className="activity-editing">
                        <span className="activity-time">{act.time}</span>
                        <div className="activity-edit-fields">
                          <input
                            type="text"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Activity"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={draftNotes}
                            onChange={(e) => setDraftNotes(e.target.value)}
                            placeholder="Notes (optional)"
                          />
                          <div className="activity-edit-actions">
                            <button
                              type="button"
                              className="activity-edit-save"
                              onClick={saveEdit}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="activity-edit-cancel"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={actIdx}
                      className={editable ? "activity-editable" : ""}
                    >
                      <span className="activity-time">{act.time}</span>
                      <span className="activity-body">
                        {act.activity}
                        {act.notes && <em className="activity-note"> — {act.notes}</em>}
                      </span>
                      {editable && (
                        <span className="activity-controls">
                          <button
                            type="button"
                            className="activity-edit-btn"
                            onClick={() => startEdit(dayIdx, actIdx, act)}
                            aria-label="Edit activity"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="activity-remove-btn"
                            onClick={() => removeActivity(dayIdx, actIdx)}
                            aria-label="Remove activity"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}