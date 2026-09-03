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
import BewareOf from "./BewareOf";
import AttractionsMap from "./AttractionsMap";
import TripStub from "./TripStub";
import TripChat from "./TripChat";
import { exportTripToPdf } from "../utils/pdfExport";
import { regenerateSection, regenerateItineraryDay } from "../utils/tripAI";
import { shareTrip } from "../utils/tripShare";
import logger from "../utils/logger";

/**
 * @param {boolean} [readOnly=false] - true when viewing someone else's
 *   shared trip (via ?shared=<id>): hides "Plan another", inline itinerary
 *   editing, every regenerate button, and the Share button itself. Export
 *   to PDF stays available — a recipient might reasonably want a copy.
 */
export default function TripResult({
  trip,
  onReset,
  onUpdateItinerary,
  onUpdateTrip,
  readOnly = false,
}) {
  const [exporting, setExporting] = useState(false);
  // Holds the section key (e.g. "attractions") or "day-3" while a
  // regeneration request is in flight, so only that one section shows a
  // loading state instead of the whole page.
  const [regeneratingKey, setRegeneratingKey] = useState(null);
  const [regenerateError, setRegenerateError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");

  if (!trip) return null;

  const { input, itinerary, packingList, planner, attractions, heroImage, flights, food, shopping, currencyInfo, weather, bewareOf } = trip;

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

  const handleShare = async () => {
    setSharing(true);
    setShareError("");
    setShareUrl("");
    try {
      const id = await shareTrip(trip);
      const url = `${window.location.origin}/?shared=${id}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard access can be denied (permissions, non-HTTPS context)
        // — the link is still shown on-screen either way, just not
        // auto-copied.
      }
    } catch (err) {
      logger.error("Failed to create share link:", err);
      setShareError(err.message || "Couldn't create a share link. Please try again.");
    } finally {
      setSharing(false);
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
        {readOnly && (
          <p className="shared-trip-banner">
            You're viewing a shared trip plan.
          </p>
        )}

        <TripStub input={input} onReset={readOnly ? undefined : onReset} />

        <div className="pdf-export-row">
          <button
            className="save-pdf-btn"
            onClick={handleSavePdf}
            disabled={exporting}
          >
            {exporting ? "Preparing PDF..." : "Save as PDF"}
          </button>
          {!readOnly && (
            <button
              className="save-pdf-btn share-btn"
              onClick={handleShare}
              disabled={sharing}
            >
              {sharing ? "Creating link..." : "Share"}
            </button>
          )}
        </div>

        {shareUrl && (
          <p className="share-result">
            Link copied: <span className="share-url">{shareUrl}</span>
          </p>
        )}
        {shareError && <p className="form-error">{shareError}</p>}

        {regenerateError && (
          <p className="form-error regenerate-error">{regenerateError}</p>
        )}

        <Attractions
          attractions={attractions}
          onRegenerate={readOnly ? undefined : () => handleRegenerateSection("attractions")}
          regenerating={regeneratingKey === "attractions"}
        />
        <AttractionsMap attractions={attractions} destination={input?.destination} />
        <Weather
          weather={weather}
          destination={input?.destination}
          departureDate={input?.departureDate}
          onRegenerate={readOnly ? undefined : () => handleRegenerateSection("weather")}
          regenerating={regeneratingKey === "weather"}
        />
        <Itinerary
          itinerary={itinerary}
          onUpdateItinerary={readOnly ? undefined : onUpdateItinerary}
          onRegenerateDay={readOnly ? undefined : handleRegenerateDay}
          regeneratingDay={
            regeneratingKey?.startsWith("day-")
              ? Number(regeneratingKey.slice(4))
              : null
          }
        />
        <Flights flights={flights} currency={input?.currency} />
        <CurrencyInfo currencyInfo={currencyInfo} currency={input?.currency} />
        <BewareOf
          bewareOf={bewareOf}
          onRegenerate={readOnly ? undefined : () => handleRegenerateSection("bewareOf")}
          regenerating={regeneratingKey === "bewareOf"}
        />
        <FoodAndDrink
          food={food}
          currency={input?.currency}
          onRegenerate={readOnly ? undefined : () => handleRegenerateSection("food")}
          regenerating={regeneratingKey === "food"}
        />
        <Shopping
          shopping={shopping}
          onRegenerate={readOnly ? undefined : () => handleRegenerateSection("shopping")}
          regenerating={regeneratingKey === "shopping"}
        />
        <PackingList
          packingList={packingList}
          onRegenerate={readOnly ? undefined : () => handleRegenerateSection("packingList")}
          regenerating={regeneratingKey === "packingList"}
        />
        <TripPlanner
          planner={planner}
          currency={input?.currency}
          pax={input?.pax}
          currencyInfo={currencyInfo}
        />
      </div>

      <TripChat trip={trip} />
    </div>
  );
}