import { v4 as uuidv4 } from "uuid";
import { generateCompletion } from "./groq";
import { getDestinationHero, getAttractionImages } from "./unsplash";
import logger from "./logger";

const SYSTEM_PROMPT = `You are AbhiTrip, an expert AI travel planner. You produce
detailed, practical, and realistic trip plans. You ALWAYS respond with valid
JSON only — no markdown fences, no commentary, no text outside the JSON object.
Be specific: use real place names, realistic costs, and actionable advice
based on the destination and season where possible. You do not have access to
live flight pricing data, so any flight numbers you give are historical/typical
ESTIMATES, not live fares — always phrase them as ranges and mark them as
estimates, never as booked or guaranteed prices. You are honest about cost —
you never stretch or shrink realistic prices to make a traveler's budget fit;
if a budget is genuinely too low for a destination, you say so plainly.`;

const TRIP_TYPE_LABELS = {
  family: "a family (mix of ages, comfort and safety matter, avoid anything too intense at night)",
  couple: "a couple (romantic spots, good-for-two experiences, some quiet/scenic time)",
  "friends-men": "a group of male friends (nightlife, adventure activities, group-friendly spots welcome)",
  "friends-women": "a group of female friends (mix of relaxation, shopping, nightlife, and safety-aware suggestions)",
  solo: "a solo traveler (safety tips, easy-to-navigate solo-friendly spots, opportunities to meet people)",
};

/**
 * Custom error thrown when the AI determines the budget is not realistically
 * sufficient for the trip. Carries structured data so the UI can render a
 * proper warning instead of a generic error message.
 */
export class BudgetTooLowError extends Error {
  constructor(feasibility) {
    super(feasibility.reason || "Budget is not sufficient for this trip.");
    this.name = "BudgetTooLowError";
    this.feasibility = feasibility;
  }
}

function cleanJsonResponse(raw) {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Step 1: fast, cheap feasibility check. Asks the model whether the given
 * budget can realistically cover the trip (stay + food + local transport +
 * flights if included) for this many people/days. This runs BEFORE the
 * expensive full-plan generation so an unrealistic budget fails fast.
 */
async function checkBudgetFeasibility({
  destination,
  departureCity,
  budget,
  currency,
  pax,
  days,
  flightsIncluded,
}) {
  const prompt = `
Assess whether this trip budget is realistic. Be strict and honest — do not
be generous or optimistic. Base this on real typical costs (budget-tier
accommodation, local food, local transport${flightsIncluded ? ", and round-trip flights" : ""}).

- Destination: ${destination}
- Departure city: ${flightsIncluded ? departureCity : "N/A (flights excluded)"}
- Total budget: ${budget} ${currency}
- Travelers: ${pax}
- Duration: ${days} days
- Flights included in budget: ${flightsIncluded ? "yes" : "no"}

Respond ONLY with JSON in this exact shape:
{
  "minimumRealisticBudget": 0,
  "currency": "${currency}",
  "reason": "1-2 sentences explaining the cost estimate, mentioning the biggest cost driver"
}

minimumRealisticBudget is the TOTAL minimum for all ${pax} traveler(s) for all ${days} day(s),
in ${currency}, using budget-tier (not luxury) choices. Round to a sensible number.
Do not judge feasibility yourself — just give the honest minimum figure.
`.trim();

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
    maxTokens: 400,
    json: true,
  });

  let result;
  try {
    result = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse feasibility check:", err, raw);
    // Fail open — if the check itself breaks, don't block the user over it.
    return { feasible: true };
  }

  const minimum = Number(result.minimumRealisticBudget);

  // Decide feasibility ourselves from the numbers — never trust an LLM's own
  // true/false verdict on a comparison it already computed the inputs for.
  // A small margin (5%) avoids blocking someone whose budget is a hair under
  // a "minimum" that's itself just an estimate.
  const feasible = !Number.isFinite(minimum) || Number(budget) >= minimum * 0.95;

  return {
    feasible,
    minimumRealisticBudget: Number.isFinite(minimum) ? minimum : null,
    currency: result.currency || currency,
    reason: result.reason,
  };
}

function buildPrompt({
  destination,
  departureCity,
  budget,
  currency,
  pax,
  days,
  flightsIncluded,
  tripType,
}) {
  const tripTypeContext = TRIP_TYPE_LABELS[tripType] || "a general traveler";

  return `
Plan a trip with these details:
- Destination: ${destination}
- Total budget: ${budget} ${currency}
- Travelers: ${pax}
- Trip type: this trip is for ${tripTypeContext}. Tailor the itinerary, activity picks, and tips to suit this group.
- Duration: ${days} days
- Flights: ${
    flightsIncluded
      ? `estimate round-trip flight fares from ${departureCity} to ${destination}, in ${currency}, and include in budget`
      : "traveler is arranging flights separately, exclude flight cost from budget"
  }

Respond ONLY with a JSON object in this exact shape:

{
  "itinerary": [
    {
      "day": 1,
      "title": "short theme for the day",
      "activities": [
        { "time": "Morning", "activity": "description", "notes": "optional tip" },
        { "time": "Afternoon", "activity": "description", "notes": "optional tip" },
        { "time": "Evening", "activity": "description", "notes": "optional tip" }
      ]
    }
  ],
  "packingList": {
    "clothing": ["item1", "item2"],
    "documents": ["item1", "item2"],
    "electronics": ["item1", "item2"],
    "toiletries": ["item1", "item2"],
    "misc": ["item1", "item2"]
  },
  "planner": {
    "budgetBreakdown": [
      { "category": "Accommodation", "amount": 0, "percentage": 0 },
      { "category": "Food", "amount": 0, "percentage": 0 },
      { "category": "Transport", "amount": 0, "percentage": 0 },
      { "category": "Activities", "amount": 0, "percentage": 0 },
      { "category": "Flights", "amount": 0, "percentage": 0 },
      { "category": "Misc/Buffer", "amount": 0, "percentage": 0 }
    ],
    "tips": ["tip1", "tip2", "tip3"],
    "totalEstimate": 0
  },
  "attractions": [
    {
      "name": "Attraction name",
      "category": "Landmark | Museum | Nature | Religious | Market | Viewpoint",
      "description": "2-3 sentence description of what it is and why visit, mentioning why it suits ${tripType ? "this group" : "travelers"}",
      "historicalSignificance": "1-3 sentences of real historical/cultural context, or null if the place has no notable history (e.g. a modern beach or mall)",
      "bestTimeToVisit": "e.g. Early morning, Sunset",
      "estimatedDuration": "e.g. 2-3 hours"
    }
  ],
  "flights": ${
    flightsIncluded
      ? `{
    "departureCity": "${departureCity}",
    "destination": "${destination}",
    "outbound": { "priceRangeLow": 0, "priceRangeHigh": 0, "typicalAirlines": ["airline1", "airline2"], "notes": "e.g. typical duration, layover pattern" },
    "returnFlight": { "priceRangeLow": 0, "priceRangeHigh": 0, "typicalAirlines": ["airline1", "airline2"], "notes": "e.g. typical duration, layover pattern" },
    "bookingTip": "1-2 sentences, e.g. best time to book, cheaper nearby airports"
  }`
      : "null"
  },
  "food": {
    "dishes": [
      { "name": "Dish name", "type": "Main | Snack | Dessert | Street food", "description": "1-2 sentences on what it is and why it's worth trying" }
    ],
    "beverages": [
      { "name": "Beverage name", "description": "1 sentence on what it is" }
    ],
    "mealCostEstimate": {
      "breakfast": { "budget": 0, "midRange": 0 },
      "lunch": { "budget": 0, "midRange": 0 },
      "dinner": { "budget": 0, "midRange": 0 },
      "currency": "${currency}",
      "notes": "1 sentence on what budget vs mid-range means here (street food vs sit-down restaurant etc.)"
    }
  },
  "shopping": [
    { "item": "Item/craft name", "description": "1-2 sentences on what it is and why it's a good buy here", "whereToBuy": "e.g. local market name or area", "priceRange": "approx range in ${currency}" }
  ],
  "currencyInfo": {
    "isForeign": true or false,
    "localCurrencyName": "e.g. South Korean Won",
    "localCurrencyCode": "e.g. KRW",
    "approxExchangeRate": "e.g. 1 ${currency} = X KRW (approximate, mention rates fluctuate)",
    "recommendation": "carry-cash | get-local-currency | card-friendly",
    "recommendationReason": "1-2 sentences on why, specific to ${destination}",
    "airportExchangeWarning": "1-2 sentences on whether departure/arrival airport currency exchange counters are notably costly here, or null if not a particular concern",
    "betterExchangeOptions": ["option1 (e.g. local banks, ATMs on arrival, licensed exchange chains in the city)", "option2"],
    "cardTips": "1-2 sentences on debit/credit card acceptance and foreign transaction fees to watch for"
  }
}

Rules:
- budgetBreakdown amounts must sum to approximately the total budget (${budget} ${currency}). If flights are included, the "Flights" category amount should roughly match the outbound+return estimate total for all ${pax} traveler(s).
- If flights are excluded, omit or zero the "Flights" category and set "flights" to null.
- itinerary must have exactly ${days} day entries, with activity choices suited to ${tripTypeContext}.
- attractions should list 5-8 real, well-known places in ${destination} — mix of categories, not all the same type.
- historicalSignificance must be factually grounded and specific (real dates, rulers, events) where the place has genuine history. Use null if not applicable — do not invent history.
- food.dishes should list 5-8 real, well-known local dishes/specialties actually associated with ${destination}, not generic dishes.
- food.beverages should list 3-5 real local drinks (alcoholic and/or non-alcoholic as culturally relevant).
- mealCostEstimate amounts are PER PERSON, per meal, in ${currency}, realistic for ${destination}'s cost of living.
- shopping should list 4-6 real local products/crafts/souvenirs genuinely associated with ${destination}.
- currencyInfo.isForeign should be false only if ${destination}'s local currency IS ${currency} (e.g. destination and currency are the same country/region). If false, you may omit the other currencyInfo fields or set them to null.
- If isForeign is true, give a genuinely useful, destination-specific exchange recommendation — not generic advice. Be honest if card usage is fine and cash isn't really needed.
- Keep JSON valid — no trailing commas, no comments.
`.trim();
}

/**
 * Generates a full trip plan (itinerary + packing list + planner + flights +
 * food + shopping + currency/exchange tips), gated by a budget feasibility
 * pre-check. Throws BudgetTooLowError if the budget is unrealistic — the
 * caller should catch this specifically to show a warning instead of a plan.
 *
 * @param {Object} formData
 * @returns {Promise<Object>} parsed trip plan with an id
 */
export async function generateTripPlan(formData) {
  logger.info("Checking budget feasibility for", formData.destination);

  const feasibility = await checkBudgetFeasibility(formData);

  if (feasibility.feasible === false) {
    throw new BudgetTooLowError(feasibility);
  }

  const prompt = buildPrompt(formData);

  logger.info("Generating trip plan for", formData.destination);

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.7,
    maxTokens: 4096,
    json: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse AI response as JSON:", err, raw);
    throw new Error("AI returned an unexpected format. Please try again.");
  }

  const attractionNames = (parsed.attractions || []).map((a) => a.name);
  const [hero, attractionImages] = await Promise.all([
    getDestinationHero(formData.destination).catch(() => null),
    getAttractionImages(attractionNames, formData.destination).catch(
      () => []
    ),
  ]);

  const attractionsWithImages = (parsed.attractions || []).map(
    (attraction, idx) => ({
      ...attraction,
      image: attractionImages[idx] || null,
    })
  );

  return {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    input: formData,
    ...parsed,
    attractions: attractionsWithImages,
    heroImage: hero,
  };
}

export default { generateTripPlan, BudgetTooLowError };