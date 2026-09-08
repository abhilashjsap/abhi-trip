import { useState } from "react";
import Itinerary from "./Itinerary";
import PackingList from "./PackingList";
import TripPlanner from "./TripPlanner";
import Attractions from "./Attractions";
import Flights from "./Flights";
import InterCityLegs from "./InterCityLegs";
import FoodAndDrink from "./FoodAndDrink";
import Shopping from "./Shopping";
import CurrencyInfo from "./CurrencyInfo";
import Weather from "./Weather";
import BewareOf from "./BewareOf";
import EmergencyInfo from "./EmergencyInfo";
import PracticalInfo from "./PracticalInfo";
import Phrasebook from "./Phrasebook";
import AttractionsMap from "./AttractionsMap";
import RegenerateButton from "./RegenerateButton";
import TripStub from "./TripStub";
import TripChat from "./TripChat";
import { exportTripToPdf } from "../utils/pdfExport";
import {
  regenerateSection,
  regenerateItineraryDay,
  regenerateDestinationContent,
  computeDayRanges,
} from "../utils/tripAI";
import { shareTrip } from "../utils/tripShare";
import logger from "../utils/logger";

function addDays(dateStr, days) {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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

  const {
    input,
    itinerary,
    packingList,
    planner,
    heroImage,
    flights,
    interCityLegs,
    destinations,
    perDestination = [],
  } = trip;
  const isMulti = (destinations?.length || 1) > 1;
  // Each stop's own arrival date, for its own live weather forecast — the
  // trip's departureDate shifted forward by every earlier stop's day count.
  const dayRanges = destinations ? computeDayRanges(destinations) : [];
  const stopDepartureDate = (destinationName) => {
    const range = dayRanges.find((r) => r.name === destinationName);
    return range ? addDays(input?.departureDate, range.startDay - 1) : input?.departureDate;
  };

  const handleSavePdf = async () => {
    setExporting(true);
    try {
      const filename = `AbhiTrip-${(input?.destinationLabel || input?.destination || "trip").replace(/\s+/g, "-")}`;
      await exportTripToPdf(trip, filename);
    } catch (err) {
      logger.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleRegenerateSection = async (sectionKey, destinationName) => {
    const key = destinationName ? `${sectionKey}-${destinationName}` : sectionKey;
    setRegeneratingKey(key);
    setRegenerateError("");
    try {
      const updated = await regenerateSection(sectionKey, trip, input, destinationName);
      const nextPerDestination = (trip.perDestination || []).map((d) => {
        const matches = destinationName ? d.destination === destinationName : d === trip.perDestination[0];
        return matches ? { ...d, [sectionKey]: updated } : d;
      });
      onUpdateTrip(
        destinationName
          ? { ...trip, perDestination: nextPerDestination }
          : { ...trip, [sectionKey]: updated, perDestination: nextPerDestination }
      );
    } catch (err) {
      logger.error(`Failed to regenerate ${sectionKey}:`, err);
      setRegenerateError(err.message || "Couldn't regenerate that section. Please try again.");
    } finally {
      setRegeneratingKey(null);
    }
  };

  const handleRegenerateDestination = async (destinationName) => {
    const key = `dest-${destinationName}`;
    setRegeneratingKey(key);
    setRegenerateError("");
    try {
      const result = await regenerateDestinationContent(destinationName, input);
      const nextPerDestination = (trip.perDestination || []).map((d) =>
        d.destination === destinationName ? result : d
      );
      onUpdateTrip({ ...trip, perDestination: nextPerDestination });
      if (result.failed) {
        setRegenerateError(`Still couldn't load info for ${destinationName}. Please try again.`);
      }
    } catch (err) {
      logger.error(`Failed to regenerate destination ${destinationName}:`, err);
      setRegenerateError(err.message || "Couldn't regenerate that stop. Please try again.");
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
          <h1>{input?.destinationLabel || input?.destination}</h1>
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

        {isMulti ? (
          perDestination.map((dest) => (
            <div key={dest.destination} className="destination-block">
              <h3 className="destination-block-heading">{dest.destination}</h3>
              {dest.failed ? (
                <div className="destination-block-failed">
                  <p>Couldn't load info for {dest.destination} — the AI had trouble with this stop.</p>
                  {!readOnly && (
                    <RegenerateButton
                      onClick={() => handleRegenerateDestination(dest.destination)}
                      loading={regeneratingKey === `dest-${dest.destination}`}
                      label="Retry this stop"
                    />
                  )}
                </div>
              ) : (
                <>
                  <Attractions
                    attractions={dest.attractions}
                    destination={dest.destination}
                    onRegenerate={readOnly ? undefined : () => handleRegenerateSection("attractions", dest.destination)}
                    regenerating={regeneratingKey === `attractions-${dest.destination}`}
                  />
                  <Weather
                    weather={dest.weather}
                    destination={dest.destination}
                    departureDate={stopDepartureDate(dest.destination)}
                    onRegenerate={readOnly ? undefined : () => handleRegenerateSection("weather", dest.destination)}
                    regenerating={regeneratingKey === `weather-${dest.destination}`}
                  />
                  <CurrencyInfo currencyInfo={dest.currencyInfo} currency={input?.currency} />
                  <BewareOf
                    bewareOf={dest.bewareOf}
                    onRegenerate={readOnly ? undefined : () => handleRegenerateSection("bewareOf", dest.destination)}
                    regenerating={regeneratingKey === `bewareOf-${dest.destination}`}
                  />
                  <EmergencyInfo
                    emergencyInfo={dest.emergencyInfo}
                    onRegenerate={readOnly ? undefined : () => handleRegenerateSection("emergencyInfo", dest.destination)}
                    regenerating={regeneratingKey === `emergencyInfo-${dest.destination}`}
                  />
                  <PracticalInfo visaInfo={dest.visaInfo} simInfo={dest.simInfo} bookInAdvance={dest.bookInAdvance} />
                  <Phrasebook phrasebook={dest.phrasebook} />
                  <FoodAndDrink
                    food={dest.food}
                    currency={input?.currency}
                    destination={dest.destination}
                    onRegenerate={readOnly ? undefined : () => handleRegenerateSection("food", dest.destination)}
                    regenerating={regeneratingKey === `food-${dest.destination}`}
                  />
                  <Shopping
                    shopping={dest.shopping}
                    destination={dest.destination}
                    onRegenerate={readOnly ? undefined : () => handleRegenerateSection("shopping", dest.destination)}
                    regenerating={regeneratingKey === `shopping-${dest.destination}`}
                  />
                </>
              )}
            </div>
          ))
        ) : (
          <>
            <Attractions
              attractions={perDestination[0]?.attractions}
              destination={perDestination[0]?.destination || input?.destination}
              onRegenerate={readOnly ? undefined : () => handleRegenerateSection("attractions")}
              regenerating={regeneratingKey === "attractions"}
            />
            <Weather
              weather={perDestination[0]?.weather}
              destination={perDestination[0]?.destination || input?.destination}
              departureDate={input?.departureDate}
              onRegenerate={readOnly ? undefined : () => handleRegenerateSection("weather")}
              regenerating={regeneratingKey === "weather"}
            />
            <CurrencyInfo currencyInfo={perDestination[0]?.currencyInfo} currency={input?.currency} />
            <BewareOf
              bewareOf={perDestination[0]?.bewareOf}
              onRegenerate={readOnly ? undefined : () => handleRegenerateSection("bewareOf")}
              regenerating={regeneratingKey === "bewareOf"}
            />
            <EmergencyInfo
              emergencyInfo={perDestination[0]?.emergencyInfo}
              onRegenerate={readOnly ? undefined : () => handleRegenerateSection("emergencyInfo")}
              regenerating={regeneratingKey === "emergencyInfo"}
            />
            <PracticalInfo
              visaInfo={perDestination[0]?.visaInfo}
              simInfo={perDestination[0]?.simInfo}
              bookInAdvance={perDestination[0]?.bookInAdvance}
            />
            <Phrasebook phrasebook={perDestination[0]?.phrasebook} />
            <FoodAndDrink
              food={perDestination[0]?.food}
              currency={input?.currency}
              destination={perDestination[0]?.destination || input?.destination}
              onRegenerate={readOnly ? undefined : () => handleRegenerateSection("food")}
              regenerating={regeneratingKey === "food"}
            />
            <Shopping
              shopping={perDestination[0]?.shopping}
              destination={perDestination[0]?.destination || input?.destination}
              onRegenerate={readOnly ? undefined : () => handleRegenerateSection("shopping")}
              regenerating={regeneratingKey === "shopping"}
            />
          </>
        )}

        <AttractionsMap
          attractions={perDestination.flatMap((d) => d.attractions || [])}
          destination={!isMulti ? perDestination[0]?.destination || input?.destination : undefined}
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
        <InterCityLegs legs={interCityLegs} currency={input?.currency} />
        <PackingList
          packingList={packingList}
          onRegenerate={readOnly ? undefined : () => handleRegenerateSection("packingList")}
          regenerating={regeneratingKey === "packingList"}
        />
        <TripPlanner
          planner={planner}
          currency={input?.currency}
          pax={input?.pax}
          currencyInfo={isMulti ? null : perDestination[0]?.currencyInfo}
        />
      </div>

      <TripChat trip={trip} />
    </div>
  );
}