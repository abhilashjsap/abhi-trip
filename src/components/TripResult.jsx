import { useState } from "react";
import Itinerary from "./Itinerary";
import PackingList from "./PackingList";
import TripPlanner from "./TripPlanner";
import Attractions from "./Attractions";
import Flights from "./Flights";
import FoodAndDrink from "./FoodAndDrink";
import Shopping from "./Shopping";
import CurrencyInfo from "./CurrencyInfo";
import Weather from "./Weather";
import AttractionsMap from "./AttractionsMap";
import TripStub from "./TripStub";
import { exportTripToPdf } from "../utils/pdfExport";
import { regenerateSection, regenerateItineraryDay } from "../utils/tripAI";
import logger from "../utils/logger";

export default function TripResult({ trip, onReset, onUpdateItinerary, onUpdateTrip }) {
  const [exporting, setExporting] = useState(false);
  // Holds the section key (e.g. "attractions") or "day-3" while a
  // regeneration request is in flight, so only that one section shows a
  // loading state instead of the whole page.
  const [regeneratingKey, setRegeneratingKey] = useState(null);
  const [regenerateError, setRegenerateError] = useState("");

  if (!trip) return null;

  const { input, itinerary, packingList, planner, attractions, heroImage, flights, food, shopping, currencyInfo, weather } = trip;

  const handleSavePdf = async () => {
    setExporting(true);
    try {
      const filename = `AbhiTrip-${(input?.destination || "trip").replace(/\s+/g, "-")}`;
      await exportTripToPdf(trip, filename);
    } catch (err) {
      logger.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleRegenerateSection = async (sectionKey) => {
    setRegeneratingKey(sectionKey);
    setRegenerateError("");
    try {
      const updated = await regenerateSection(sectionKey, trip, input);
      onUpdateTrip({ ...trip, [sectionKey]: updated });
    } catch (err) {
      logger.error(`Failed to regenerate ${sectionKey}:`, err);
      setRegenerateError(err.message || "Couldn't regenerate that section. Please try again.");
    } finally {
      setRegeneratingKey(null);
    }
  };

  const handleRegenerateDay = async (dayNumber) => {
    setRegeneratingKey(`day-${dayNumber}`);
    setRegenerateError("");
    try {
      const newDay = await regenerateItineraryDay(dayNumber, trip, input);
      const nextItinerary = (trip.itinerary || []).map((d) =>
        d.day === dayNumber ? newDay : d
      );
      onUpdateTrip({ ...trip, itinerary: nextItinerary });
    } catch (err) {
      logger.error(`Failed to regenerate day ${dayNumber}:`, err);
      setRegenerateError(err.message || "Couldn't regenerate that day. Please try again.");
    } finally {
      setRegeneratingKey(null);
    }
  };

  return (
    <div className="trip-result">
      <div className="hero" style={
        heroImage ? { backgroundImage: `url(${heroImage.url})` } : undefined
      }>
        <div className="hero-overlay" />
        <div className="hero-content">
          <span className="hero-eyebrow">Trip dossier</span>
          <h1>{input?.destination}</h1>
          <p>{input?.days} days of plans, packed and mapped out.</p>
        </div>
        {heroImage?.credit && (
          <a
            className="hero-credit"
            href={heroImage.credit.link}
            target="_blank"
            rel="noreferrer"
          >
            Photo: {heroImage.credit.name} / Unsplash
          </a>
        )}
      </div>

      <div className="trip-body">
        <TripStub input={input} onReset={onReset} />

        <div className="pdf-export-row">
          <button
            className="save-pdf-btn"
            onClick={handleSavePdf}
            disabled={exporting}
          >
            {exporting ? "Preparing PDF..." : "Save as PDF"}
          </button>
        </div>

        {regenerateError && (
          <p className="form-error regenerate-error">{regenerateError}</p>
        )}

        <Attractions
          attractions={attractions}
          onRegenerate={() => handleRegenerateSection("attractions")}
          regenerating={regeneratingKey === "attractions"}
        />
        <AttractionsMap attractions={attractions} destination={input?.destination} />
        <Weather
          weather={weather}
          onRegenerate={() => handleRegenerateSection("weather")}
          regenerating={regeneratingKey === "weather"}
        />
        <Itinerary
          itinerary={itinerary}
          onUpdateItinerary={onUpdateItinerary}
          onRegenerateDay={handleRegenerateDay}
          regeneratingDay={
            regeneratingKey?.startsWith("day-")
              ? Number(regeneratingKey.slice(4))
              : null
          }
        />
        <Flights flights={flights} currency={input?.currency} />
        <CurrencyInfo currencyInfo={currencyInfo} currency={input?.currency} />
        <FoodAndDrink
          food={food}
          currency={input?.currency}
          onRegenerate={() => handleRegenerateSection("food")}
          regenerating={regeneratingKey === "food"}
        />
        <Shopping
          shopping={shopping}
          onRegenerate={() => handleRegenerateSection("shopping")}
          regenerating={regeneratingKey === "shopping"}
        />
        <PackingList
          packingList={packingList}
          onRegenerate={() => handleRegenerateSection("packingList")}
          regenerating={regeneratingKey === "packingList"}
        />
        <TripPlanner planner={planner} currency={input?.currency} />
      </div>
    </div>
  );
}