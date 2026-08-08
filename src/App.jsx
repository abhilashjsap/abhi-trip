import { useState, useEffect } from "react";
import TripForm from "./components/TripForm";
import TripResult from "./components/TripResult";
import BudgetWarning from "./components/BudgetWarning";
import PasswordGate, { isUnlocked } from "./components/PasswordGate";
import { generateTripPlan, BudgetTooLowError } from "./utils/tripAI";
import logger from "./utils/logger";
import "./App.css";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feasibility, setFeasibility] = useState(null);
  const [lastInput, setLastInput] = useState(null);

  useEffect(() => {
    setUnlocked(isUnlocked());
  }, []);

  const handleGenerate = async (formData) => {
    setLoading(true);
    setError("");
    setFeasibility(null);
    setLastInput(formData);
    try {
      const result = await generateTripPlan(formData);
      setTrip(result);
    } catch (err) {
      if (err instanceof BudgetTooLowError) {
        logger.info("Budget infeasible:", err.feasibility);
        setFeasibility(err.feasibility);
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
  };

  const handleAdjust = () => {
    setFeasibility(null);
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
        <TripResult trip={trip} onReset={handleReset} />
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
        <TripForm onSubmit={handleGenerate} loading={loading} />
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
