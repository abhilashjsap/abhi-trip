import { useRef, useState } from "react";
import Itinerary from "./Itinerary";
import PackingList from "./PackingList";
import TripPlanner from "./TripPlanner";
import Attractions from "./Attractions";
import Flights from "./Flights";
import FoodAndDrink from "./FoodAndDrink";
import Shopping from "./Shopping";
import CurrencyInfo from "./CurrencyInfo";
import Weather from "./Weather";
import TripStub from "./TripStub";
import { exportElementToPdf } from "../utils/pdfExport";
import logger from "../utils/logger";

export default function TripResult({ trip, onReset }) {
  const captureRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  if (!trip) return null;

  const { input, itinerary, packingList, planner, attractions, heroImage, flights, food, shopping, currencyInfo, weather } = trip;

  const handleSavePdf = async () => {
    setExporting(true);
    try {
      const filename = `AbhiTrip-${(input?.destination || "trip").replace(/\s+/g, "-")}`;
      await exportElementToPdf(captureRef.current, filename);
    } catch (err) {
      logger.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="trip-result" ref={captureRef}>
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

        <div className="pdf-export-row" data-html2canvas-ignore="true">
          <button
            className="save-pdf-btn"
            onClick={handleSavePdf}
            disabled={exporting}
          >
            {exporting ? "Preparing PDF..." : "Save as PDF"}
          </button>
        </div>

        <Attractions attractions={attractions} />
        <Weather weather={weather} />
        <Itinerary itinerary={itinerary} />
        <Flights flights={flights} currency={input?.currency} />
        <CurrencyInfo currencyInfo={currencyInfo} currency={input?.currency} />
        <FoodAndDrink food={food} currency={input?.currency} />
        <Shopping shopping={shopping} />
        <PackingList packingList={packingList} />
        <TripPlanner planner={planner} currency={input?.currency} />
      </div>
    </div>
  );
}