import { useState } from "react";
import { estimateBudgetForCategory, BUDGET_CATEGORIES } from "../utils/tripAI";
import { RateLimitError } from "../utils/gemini";
import DestinationAutocomplete from "./DestinationAutocomplete";
import logger from "../utils/logger";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD"];

const TRIP_TYPES = [
  { value: "family", label: "Family" },
  { value: "couple", label: "Couple" },
  { value: "friends-men", label: "Friends (Men)" },
  { value: "friends-women", label: "Friends (Women)" },
  { value: "solo", label: "Solo" },
];

const initialState = {
  destination: "",
  departureCity: "",
  departureDate: "",
  budget: "",
  currency: "INR",
  pax: 1,
  days: 3,
  flightsIncluded: false,
  tripType: "",
};

export default function TripForm({ onSubmit, loading }) {
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [budgetFromCategory, setBudgetFromCategory] = useState(false);
  const [estimating, setEstimating] = useState(false);

  const handleChange = (field) => (e) => {
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    // Any manual edit to the amount (or its dependent fields) invalidates
    // the "came from a category" flag, so typing over a suggested amount
    // correctly re-enables the feasibility check.
    if (field === "budget") {
      setBudgetFromCategory(false);
    }
  };

  // Autocomplete components hand back a plain string (not an input event),
  // so they get their own setter instead of reusing handleChange.
  const handleFieldValue = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const canEstimate =
    form.destination.trim() &&
    form.days &&
    Number(form.days) >= 1 &&
    form.pax &&
    Number(form.pax) >= 1 &&
    (!form.flightsIncluded || form.departureCity.trim());

  const handlePickCategory = async (categoryKey) => {
    setSelectedCategory(categoryKey);
    setError("");

    if (!canEstimate) {
      setError(
        "Fill in destination, travelers, days" +
          (form.flightsIncluded ? ", and departure city" : "") +
          " first, so we can estimate a realistic amount."
      );
      return;
    }

    setEstimating(true);
    try {
      const result = await estimateBudgetForCategory({
        destination: form.destination,
        departureCity: form.departureCity,
        currency: form.currency,
        pax: Number(form.pax),
        days: Number(form.days),
        flightsIncluded: form.flightsIncluded,
        budgetCategory: categoryKey,
      });

      if (result.estimatedBudget) {
        setForm((prev) => ({ ...prev, budget: String(result.estimatedBudget) }));
        setBudgetFromCategory(true);
      } else {
        setError("Couldn't estimate a budget for that category. Try entering an amount instead.");
      }
    } catch (err) {
      logger.error("Category budget estimate failed:", err);
      if (err instanceof RateLimitError) {
        setError("The AI's daily free usage limit has been reached for this app. Please try again later, or enter a budget amount manually.");
      } else {
        setError(err.message || "Couldn't estimate a budget. Please try again.");
      }
    } finally {
      setEstimating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!form.destination.trim()) {
      setError("Please enter a destination.");
      return;
    }
    if (form.flightsIncluded && !form.departureCity.trim()) {
      setError("Please enter your departure city, or turn off flight estimates.");
      return;
    }
    if (!form.budget || Number(form.budget) <= 0) {
      setError("Please enter a budget, or pick a category above.");
      return;
    }
    if (!form.pax || Number(form.pax) < 1) {
      setError("Number of travelers must be at least 1.");
      return;
    }
    if (!form.days || Number(form.days) < 1) {
      setError("Trip must be at least 1 day.");
      return;
    }
    if (!form.tripType) {
      setError("Please select who this trip is for.");
      return;
    }

    onSubmit({
      ...form,
      budget: Number(form.budget),
      pax: Number(form.pax),
      days: Number(form.days),
      budgetFromCategory,
      budgetCategory: budgetFromCategory ? selectedCategory : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="trip-form">
      <DestinationAutocomplete
        id="destination"
        label="Destination"
        placeholder="e.g. Goa, India"
        value={form.destination}
        onChange={handleFieldValue("destination")}
        disabled={loading}
      />

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="pax">Travelers</label>
          <input
            id="pax"
            type="number"
            min="1"
            value={form.pax}
            onChange={handleChange("pax")}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="days">Days</label>
          <input
            id="days"
            type="number"
            min="1"
            max="30"
            value={form.days}
            onChange={handleChange("days")}
            disabled={loading}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="departureDate">Departure date (optional)</label>
        <input
          id="departureDate"
          type="date"
          min={new Date().toISOString().slice(0, 10)}
          value={form.departureDate}
          onChange={handleChange("departureDate")}
          disabled={loading}
        />
        <span className="field-hint">
          Helps line up the weather forecast with your actual trip dates.
        </span>
      </div>

      <div className="form-group checkbox-group">
        <label htmlFor="flightsIncluded">
          <input
            id="flightsIncluded"
            type="checkbox"
            checked={form.flightsIncluded}
            onChange={handleChange("flightsIncluded")}
            disabled={loading}
          />
          Estimate flight fares
        </label>
      </div>

      {form.flightsIncluded && (
        <DestinationAutocomplete
          id="departureCity"
          label="Departure city"
          placeholder="e.g. Bengaluru"
          value={form.departureCity}
          onChange={handleFieldValue("departureCity")}
          disabled={loading}
        />
      )}

      <div className="form-group">
        <label>Budget level (optional quick-fill)</label>
        <div className="budget-category-grid">
          {Object.entries(BUDGET_CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              type="button"
              className={
                "budget-category-btn" +
                (selectedCategory === key && budgetFromCategory ? " active" : "")
              }
              onClick={() => handlePickCategory(key)}
              disabled={loading || estimating}
            >
              <span className="budget-category-emoji">{cat.emoji}</span>
              <span className="budget-category-label">{cat.label}</span>
              <span className="budget-category-desc">{cat.description}</span>
            </button>
          ))}
        </div>
        {estimating && (
          <p className="budget-category-status">Estimating a realistic amount...</p>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="budget">Budget amount</label>
          <input
            id="budget"
            type="number"
            min="1"
            placeholder="50000"
            value={form.budget}
            onChange={handleChange("budget")}
            disabled={loading}
          />
          {budgetFromCategory && (
            <span className="budget-category-hint">
              Suggested for {BUDGET_CATEGORIES[selectedCategory]?.label} — edit if you like
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="currency">Currency</label>
          <select
            id="currency"
            value={form.currency}
            onChange={handleChange("currency")}
            disabled={loading}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="tripType">Who's this trip for</label>
        <select
          id="tripType"
          value={form.tripType}
          onChange={handleChange("tripType")}
          disabled={loading}
        >
          <option value="" disabled>
            Select trip type
          </option>
          {TRIP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      <button type="submit" disabled={loading || estimating}>
        {loading ? "Planning your trip..." : "Generate Trip Plan"}
      </button>
    </form>
  );
}