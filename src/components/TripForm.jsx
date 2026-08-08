import { useState } from "react";

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

  const handleChange = (field) => (e) => {
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
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
      setError("Please enter a valid budget.");
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
    });
  };

  return (
    <form onSubmit={handleSubmit} className="trip-form">
      <div className="form-group">
        <label htmlFor="destination">Destination</label>
        <input
          id="destination"
          type="text"
          placeholder="e.g. Goa, India"
          value={form.destination}
          onChange={handleChange("destination")}
          disabled={loading}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="budget">Budget</label>
          <input
            id="budget"
            type="number"
            min="1"
            placeholder="50000"
            value={form.budget}
            onChange={handleChange("budget")}
            disabled={loading}
          />
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
        <div className="form-group">
          <label htmlFor="departureCity">Departure city</label>
          <input
            id="departureCity"
            type="text"
            placeholder="e.g. Bengaluru"
            value={form.departureCity}
            onChange={handleChange("departureCity")}
            disabled={loading}
          />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Planning your trip..." : "Generate Trip Plan"}
      </button>
    </form>
  );
}
