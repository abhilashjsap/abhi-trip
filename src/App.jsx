import { useState, useEffect } from "react";
import TripForm from "./components/TripForm";
import TripResult from "./components/TripResult";
import BudgetWarning from "./components/BudgetWarning";
import TripHistory from "./components/TripHistory";
import UsageDashboard from "./components/UsageDashboard";
import PasswordGate, { isUnlocked } from "./components/PasswordGate";
import { generateTripPlan, BudgetTooLowError } from "./utils/tripAI";
import { RateLimitError } from "./utils/groq";
import {
  cacheCurrentTrip,
  loadCachedTrip,
  clearCachedTrip,
  addTripToHistory,
} from "./utils/tripStorage";
import logger from "./utils/logger";
import "./App.css";

function formatWaitTime(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${seconds}s`;
}

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feasibility, setFeasibility] = useState(null);
  const [lastInput, setLastInput] = useState(null);
  const [view, setView] = useState("form"); // "form" | "history"
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    setUnlocked(isUnlocked());
  }, []);

  // Reload-safe: on first mount, restore whatever trip was showing before
  // a reload, instead of losing it and forcing a re-generate.
  useEffect(() => {
    if (unlocked && !trip) {
      const cached = loadCachedTrip();
      if (cached) setTrip(cached);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  const handleGenerate = async (formData) => {
    setLoading(true);
    setError("");
    setFeasibility(null);
    setLastInput(formData);
    try {
      const result = await generateTripPlan(formData);
      setTrip(result);
      cacheCurrentTrip(result);
      addTripToHistory(result);
    } catch (err) {
      if (err instanceof BudgetTooLowError) {
        logger.info("Budget infeasible:", err.feasibility);
        setFeasibility(err.feasibility);
      } else if (err instanceof RateLimitError) {
        logger.error("Rate limit hit:", err);
        const wait = formatWaitTime(err.retryAfterSeconds);
        setError(
          `We've hit the AI's daily free usage limit for this app.${
            wait ? ` It resets in about ${wait}.` : " It resets daily."
          } Please try again then.`
        );
      } else {
        logger.error("Trip generation failed:", err);
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTrip(null);
    setError("");
    setFeasibility(null);
    clearCachedTrip();
    setView("form");
  };

  const handleAdjust = () => {
    setFeasibility(null);
  };

  const handleUpdateItinerary = (nextItinerary) => {
    if (!trip) return;
    const updated = { ...trip, itinerary: nextItinerary };
    setTrip(updated);
    cacheCurrentTrip(updated);
    addTripToHistory(updated); // keep history entry in sync with edits
  };

  const handleSelectFromHistory = (selectedTrip) => {
    setTrip(selectedTrip);
    cacheCurrentTrip(selectedTrip);
    setView("form");
  };

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-state">
          <div className="loading-mark" />
          <p>Mapping out your trip...</p>
        </div>
      </div>
    );
  }

  if (feasibility) {
    return (
      <div className="app-container">
        <div className="landing">
          <BudgetWarning
            feasibility={feasibility}
            input={lastInput}
            onAdjust={handleAdjust}
          />
        </div>
      </div>
    );
  }

  if (trip) {
    return (
      <div className="app-container">
        <TripResult
          trip={trip}
          onReset={handleReset}
          onUpdateItinerary={handleUpdateItinerary}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="landing">
        <div className="landing-header">
          <span className="brand-mark">AbhiTrip</span>
          <h1>Plan the whole trip in one shot.</h1>
          <p>
            Give us a destination, a budget, and how many days you've got.
            We'll build the itinerary, the packing list, and the numbers.
          </p>
        </div>

        <div className="landing-toolbar">
          <UsageDashboard />
          {view === "form" && (
            <button
              type="button"
              className="history-link-btn"
              onClick={() => setView("history")}
            >
              View past trips
            </button>
          )}
        </div>

        {view === "history" ? (
          <TripHistory
            key={historyKey}
            onSelect={handleSelectFromHistory}
            onClose={() => setView("form")}
            refreshKey={historyKey}
            onRefresh={() => setHistoryKey((k) => k + 1)}
          />
        ) : (
          <>
            <TripForm onSubmit={handleGenerate} loading={loading} />
            {error && <p className="form-error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}