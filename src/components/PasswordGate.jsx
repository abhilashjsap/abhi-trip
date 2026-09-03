import { useState } from "react";

const SESSION_KEY = "abhitrip_unlocked";
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;

export function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export default function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "true");
      setError("");
      onUnlock();
    } else {
      setError("Incorrect password.");
    }
  };

  return (
    <div className="landing gate-landing">
      <div className="landing-header">
        <span className="brand-mark">AbhiTrip</span>
        <h1>This trip planner is private.</h1>
        <p>Enter the password to continue.</p>
      </div>
      <form onSubmit={handleSubmit} className="trip-form gate-form">
        <div className="form-group">
          <label htmlFor="gate-password">Password</label>
          <input
            id="gate-password"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">Enter</button>
      </form>
    </div>
  );
}
