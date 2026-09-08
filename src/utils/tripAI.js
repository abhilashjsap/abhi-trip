import { v4 as uuidv4 } from "uuid";
import { generateCompletion, MODEL_LARGE, MODEL_SMALL, MODEL_FALLBACK } from "./gemini";
import { getDestinationHero, getAttractionImages } from "./unsplash";
import { getExchangeRate } from "./fx";
import {
  BUDGET_ESTIMATE_SCHEMA,
  FEASIBILITY_SCHEMA,
  TRIP_PLAN_SCHEMA,
  PER_DESTINATION_SCHEMA,
  ITINERARY_AND_BUDGET_SCHEMA,
  accommodationSchema,
  attractionSchema,
  weatherSchema,
  foodSchema,
  shoppingItemSchema,
  packingListSchema,
  itineraryDaySchema,
  bewareOfItemSchema,
  emergencyInfoSchema,
  tripExtrasSchema,
} from "./tripSchemas";
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

export const BUDGET_CATEGORIES = {
  cheapest: {
    label: "Cheapest",
    emoji: "🪙",
    description: "Bare minimum, lowest-cost options",
    tier: "hostels/dorms or the cheapest guesthouses, street food and self-catering, public transport only, free/low-cost attractions",
  },
  budget: {
    label: "Budget",
    emoji: "💰",
    description: "Affordable but reasonably comfortable",
    tier: "budget hotels or private guesthouse rooms, mix of street food and cheap sit-down meals, mostly public transport with occasional taxis, mostly paid attractions",
  },
  "mid-range": {
    label: "Mid-range",
    emoji: "💼",
    description: "Comfortable, good hotels and experiences",
    tier: "3-star hotels, sit-down restaurants, mix of taxis/rideshare and public transport, most attractions and a couple of paid experiences",
  },
  premium: {
    label: "Premium",
    emoji: "✨",
    description: "High comfort, better hotels, more convenience",
    tier: "4-star hotels, good restaurants, private transport/rideshare as default, most attractions plus premium experiences",
  },
  luxury: {
    label: "Luxury",
    emoji: "🥂",
    description: "5-star hotels, fine dining, private experiences",
    tier: "5-star hotels, fine dining, private drivers/guides, premium and private experiences",
  },
  "ultra-luxury": {
    label: "Ultra-luxury",
    emoji: "👑",
    description: "Top-end hotels, suites/villas, private everything",
    tier: "top-end suites/villas/resorts, fine dining and private chefs where relevant, private drivers and guides throughout, exclusive/private experiences",
  },
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
 * Estimates a realistic total trip budget for a given comfort category
 * (e.g. "mid-range"). Used to pre-fill the amount field when the user picks
 * a category instead of typing a number. Since the category itself defines
 * what's "realistic," this is NOT run through the feasibility check.
 */
export async function estimateBudgetForCategory({
  destination,
  departureCity,
  currency,
  pax,
  days,
  flightsIncluded,
  budgetCategory,
}) {
  const category = BUDGET_CATEGORIES[budgetCategory];
  if (!category) {
    throw new Error("Unknown budget category.");
  }

  const prompt = `
Estimate a realistic TOTAL trip cost for the following, at a "${category.label}"
comfort level: ${category.tier}.

- Destination: ${destination}
- Departure city: ${flightsIncluded ? departureCity : "N/A (flights excluded)"}
- Travelers: ${pax}
- Duration: ${days} days (${Math.max(days - 1, 1)} nights of accommodation)
- Flights included in total: ${flightsIncluded ? "yes" : "no"}

Work this out category by category (accommodation is per ROOM per night — work
out how many rooms ${pax} traveler(s) actually need, don't multiply room cost
by every traveler), being careful with your multiplication.

Respond ONLY with JSON in this exact shape:
{
  "breakdown": [
    { "category": "Accommodation", "perUnitCost": 0, "unit": "per room per night", "units": 0, "subtotal": 0 },
    { "category": "Food", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Local transport", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Activities/experiences", "perUnitCost": 0, "unit": "per person for the trip", "units": 0, "subtotal": 0 }${
      flightsIncluded
        ? `,\n    { "category": "Flights", "perUnitCost": 0, "unit": "per person round-trip", "units": ${pax}, "subtotal": 0 }`
        : ""
    }
  ],
  "estimatedBudget": 0,
  "currency": "${currency}"
}

Rules:
- Each "subtotal" MUST equal perUnitCost × units — check your own multiplication.
- estimatedBudget MUST equal the sum of all "subtotal" values. Add them up yourself.
- All figures in ${currency}, for the TOTAL trip (all ${pax} traveler(s), all ${days} day(s)) unless a line item says otherwise.
`.trim();

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
    maxTokens: 1500,
    json: true,
    schema: BUDGET_ESTIMATE_SCHEMA,
    model: MODEL_SMALL,
    thinkingLevel: "MINIMAL",
  });

  let result;
  try {
    result = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse budget category estimate:", err, raw);
    throw new Error("Couldn't estimate a budget for that category. Please try again.");
  }

  // Recompute ourselves — same reasoning as the feasibility check: trust
  // per-unit figures, not the model's own final arithmetic.
  const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
  const recomputed = breakdown.map((line) => {
    const perUnit = Number(line.perUnitCost);
    const units = Number(line.units);
    const subtotal =
      Number.isFinite(perUnit) && Number.isFinite(units)
        ? perUnit * units
        : Number(line.subtotal) || 0;
    return { ...line, subtotal };
  });

  const total = recomputed.reduce((sum, line) => sum + (Number(line.subtotal) || 0), 0);
  const fallback = Number(result.estimatedBudget);
  const estimatedBudget = recomputed.length > 0 && total > 0 ? total : fallback;

  return {
    estimatedBudget: Number.isFinite(estimatedBudget) ? Math.round(estimatedBudget) : null,
    breakdown: recomputed,
    currency: result.currency || currency,
  };
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
Assess the realistic minimum cost for this trip. Be strict and honest — do not
be generous or optimistic, but also do not inflate numbers. Base this on real
typical costs for ${destination} at budget-tier (not luxury) choices.

- Destination: ${destination}
- Departure city: ${flightsIncluded ? departureCity : "N/A (flights excluded)"}
- Total budget: ${budget} ${currency}
- Travelers: ${pax}
- Duration: ${days} days (so ${Math.max(days - 1, 1)} nights of accommodation)
- Flights included in budget: ${flightsIncluded ? "yes" : "no"}

Work this out category by category, being careful and explicit about whether
a figure is PER PERSON or PER GROUP, and whether it's PER NIGHT/DAY or a TOTAL.
Accommodation is normally priced PER ROOM PER NIGHT (one room can sleep 2-3
people, so do not multiply room cost by every traveler) — work out how many
rooms ${pax} traveler(s) actually need.

Respond ONLY with JSON in this exact shape:
{
  "breakdown": [
    { "category": "Accommodation", "perUnitCost": 0, "unit": "per room per night", "units": 0, "subtotal": 0 },
    { "category": "Food", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Local transport", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Activities/entry fees", "perUnitCost": 0, "unit": "per person for the trip", "units": 0, "subtotal": 0 }${
      flightsIncluded
        ? `,\n    { "category": "Flights", "perUnitCost": 0, "unit": "per person round-trip", "units": ${pax}, "subtotal": 0 }`
        : ""
    }
  ],
  "minimumRealisticBudget": 0,
  "currency": "${currency}",
  "reason": "1-2 sentences explaining the total, mentioning the biggest cost driver"
}

Rules:
- Each "subtotal" MUST equal perUnitCost × units — check your own multiplication.
- minimumRealisticBudget MUST equal the sum of all "subtotal" values in breakdown. Add them up yourself, don't estimate separately.
- All figures in ${currency}, for the TOTAL trip (all ${pax} traveler(s), all ${days} day(s)) unless a line item says otherwise.
- Do not judge feasibility yourself — just give the honest, correctly-summed minimum figure.
`.trim();

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
    maxTokens: 1500,
    json: true,
    schema: FEASIBILITY_SCHEMA,
    model: MODEL_SMALL,
    thinkingLevel: "MINIMAL",
  });

  let result;
  try {
    result = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse feasibility check:", err, raw);
    // Fail open — if the check itself breaks, don't block the user over it.
    return { feasible: true };
  }

  // Never trust a single top-line total from the model — recompute it
  // ourselves from the itemized breakdown (perUnitCost × units per line),
  // since LLMs reliably state correct per-unit figures but can still botch
  // the multiplication/summation step (e.g. multiplying per-room hotel cost
  // by every traveler instead of by number of rooms).
  const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
  const recomputedSubtotals = breakdown.map((line) => {
    const perUnit = Number(line.perUnitCost);
    const units = Number(line.units);
    const computedSubtotal =
      Number.isFinite(perUnit) && Number.isFinite(units)
        ? perUnit * units
        : Number(line.subtotal) || 0;
    return { ...line, subtotal: computedSubtotal };
  });

  const recomputedTotal = recomputedSubtotals.reduce(
    (sum, line) => sum + (Number(line.subtotal) || 0),
    0
  );

  const fallback = Number(result.minimumRealisticBudget);
  const minimum = recomputedSubtotals.length > 0 && recomputedTotal > 0
    ? recomputedTotal
    : fallback;

  // Decide feasibility ourselves from the numbers — never trust an LLM's own
  // true/false verdict on a comparison it already computed the inputs for.
  // A small margin (5%) avoids blocking someone whose budget is a hair under
  // a "minimum" that's itself just an estimate.
  const feasible = !Number.isFinite(minimum) || Number(budget) >= minimum * 0.95;

  return {
    feasible,
    minimumRealisticBudget: Number.isFinite(minimum) ? Math.round(minimum) : null,
    breakdown: recomputedSubtotals,
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
  budgetCategory,
}) {
  const tripTypeContext = TRIP_TYPE_LABELS[tripType] || "a general traveler";
  const categoryInfo = BUDGET_CATEGORIES[budgetCategory];

  return `
Plan a trip with these details:
- Destination: ${destination}
- Total budget: ${budget} ${currency}${
    categoryInfo
      ? ` (this is a "${categoryInfo.label}" comfort-level trip: ${categoryInfo.tier}. Choose hotels, restaurants, and transport that genuinely match this tier.)`
      : ""
  }
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
  "weather": {
    "months": [
      { "month": "January", "avgHighC": 0, "avgLowC": 0, "conditions": "e.g. Hot and humid, Cool and dry, Monsoon rains", "rating": "best | good | okay | avoid", "bestFor": "1 short sentence on what's best to do/try that month specifically — a seasonal activity, festival/event, or seasonal food/produce at its peak, or null if nothing month-specific stands out" }
    ],
    "bestMonthsSummary": "1-2 sentences naming the best window(s) to visit and why",
    "avoidMonthsSummary": "1-2 sentences on months to avoid and why (e.g. monsoon, extreme heat), or null if there's no notably bad time"
  },
  "itinerary": [
    {
      "day": 1,
      "destination": "${destination}",
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
  "accommodation": {
    "tier": "e.g. 3-star hotel, boutique guesthouse, hostel dorm — matching the trip's comfort level",
    "pricePerNightLow": 0,
    "pricePerNightHigh": 0,
    "unit": "per room per night",
    "areaRecommendation": "1 sentence naming a good area/neighborhood to stay in ${destination} and why, or null",
    "notes": "1-2 sentences, e.g. what this tier typically includes, when to book, seasonal price swings, or null"
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
    "oneUnitOfInputCurrencyInLocal": 0,
    "exchangeRateNote": "approximate, rates fluctuate — 1-2 words max, e.g. 'approx.'",
    "recommendation": "carry-cash | get-local-currency | card-friendly",
    "recommendationReason": "1-2 sentences on why, specific to ${destination}",
    "airportExchangeWarning": "1-2 sentences on whether departure/arrival airport currency exchange counters are notably costly here, or null if not a particular concern",
    "betterExchangeOptions": ["option1 (e.g. local banks, ATMs on arrival, licensed exchange chains in the city)", "option2"],
    "cardTips": "1-2 sentences on debit/credit card acceptance and foreign transaction fees to watch for"
  },
  "bewareOf": [
    { "title": "Short name of the scam/hazard/pitfall", "description": "1-2 sentences on what it is and how to avoid it, specific to ${destination}" }
  ],
  "emergencyInfo": {
    "generalEmergencyNumber": "the real emergency number(s) used in ${destination}",
    "embassyNote": "1-2 sentences on how a traveler from ${departureCity} can find/contact their home country's embassy or consulate in ${destination} if needed"
  }
}

Rules:
- weather.months must have exactly 12 entries, one per calendar month (January through December), with realistic typical temperature averages in Celsius for ${destination}.
- rating reflects how good that month is for tourism specifically (weather + crowds + typical conditions), not just raw temperature — "best" for the ideal window, "avoid" for genuinely bad months (monsoon, extreme heat/cold, etc.), "good"/"okay" in between.
- bestFor should be genuinely month-specific (a real festival/event that happens then, a seasonal fruit/dish in season, a seasonal activity like cherry blossoms or whale watching) — don't repeat generic sightseeing advice across every month. Use null if nothing distinct applies that month.
- Base weather on ${destination}'s real typical climate — these are historical seasonal averages, not a live forecast.
- budgetBreakdown amounts must sum to approximately the total budget (${budget} ${currency}), and must be built bottom-up from what THIS specific itinerary actually costs — not arbitrary round percentages that merely add up.
- If flights are included, the "Flights" category must cover the international outbound+return fares for all ${pax} traveler(s) AND the cost of any domestic/connecting flight the itinerary itself includes between cities (e.g. a multi-city route that flies from one place to another mid-trip) — don't silently drop that leg from the budget just because it isn't in outbound/returnFlight.
- The "Activities" category must reflect realistic, typical entrance/ticket/tour prices for the SPECIFIC paid attractions and excursions this itinerary actually includes (e.g. a cable car, a day cruise with lunch, a paid museum), multiplied by ${pax} traveler(s) — not a generic leftover percentage. A day likely to include one or more marquee paid excursions should visibly cost more per person than a day of free walking/sightseeing.
- The "Transport" category should cover realistic costs for the specific transfers this itinerary describes (private transfers, intercity minibus/car, in-city rides) for a group of ${pax}, not just a token amount.
- accommodation must reflect the SAME hotel tier the itinerary/budget actually assumes${
    categoryInfo ? ` (${categoryInfo.tier})` : ""
  } — pricePerNightLow/High is PER ROOM (not per person), realistic for ${destination}, and consistent with budgetBreakdown's "Accommodation" total (roughly pricePerNight × rooms needed for ${pax} traveler(s) × ${Math.max(days - 1, 1)} night(s)).
- If flights are excluded, omit or zero the "Flights" category and set "flights" to null.
- itinerary must have exactly ${days} day entries, with activity choices suited to ${tripTypeContext}. Every day's "destination" field must be exactly "${destination}".
- attractions should list 5-8 real, well-known places in ${destination} — mix of categories, not all the same type.
- historicalSignificance must be factually grounded and specific (real dates, rulers, events) where the place has genuine history. Use null if not applicable — do not invent history.
- food.dishes should list 5-8 real, well-known local dishes/specialties actually associated with ${destination}, not generic dishes.
- food.beverages should list 3-5 real local drinks (alcoholic and/or non-alcoholic as culturally relevant).
- mealCostEstimate amounts are PER PERSON, per meal, in ${currency}, realistic for ${destination}'s cost of living.
- shopping should list 4-6 real local products/crafts/souvenirs genuinely associated with ${destination}.
- currencyInfo.isForeign should be false only if ${destination}'s local currency IS ${currency} (e.g. destination and currency are the same country/region). If false, you may omit the other currencyInfo fields or set them to null.
- oneUnitOfInputCurrencyInLocal must be a plain number: how many units of the local currency you get for 1 unit of ${currency} (e.g. if 1 INR = 18 MYR-equivalent-in-cents... just give the direct numeric rate, however small or large).
- If isForeign is true, give a genuinely useful, destination-specific exchange recommendation — not generic advice. Be honest if card usage is fine and cash isn't really needed.
- bewareOf should list 3-5 real, specific things travelers should watch out for in ${destination} — common scams, safety concerns, cultural faux pas, or practical pitfalls (overcharging, fake tour operators, pickpocketing hotspots, unsafe tap water, aggressive touts, etc.). Be specific and honest about ${destination} — if it's genuinely very safe with few notable scams, say so plainly in one item rather than inventing generic ones that don't really apply.
- emergencyInfo.generalEmergencyNumber must be the actual real emergency contact number(s) used in ${destination} (e.g. a single unified number like "112" or "999", or split numbers like "100 Police / 101 Fire / 102 Ambulance" if the country uses separate ones) — never invent a plausible-looking number.
- emergencyInfo.embassyNote should be practical, specific guidance for a traveler from ${departureCity} on finding/contacting their home country's embassy or consulate in ${destination} — not generic "contact your embassy" filler.
- Every text field must contain real, specific content about ${destination} — never placeholder or filler text (e.g. never write literal text like "reason text" or "description here"). If a field genuinely doesn't apply, use null instead of a placeholder.
- Keep JSON valid — no trailing commas, no comments.
`.trim();
}

/**
 * Fetches visa/SIM/phrasebook/book-ahead/photo-tip info via a separate,
 * smaller follow-up call rather than folding it into TRIP_PLAN_SCHEMA — the
 * main schema has already grown to 11 required top-level sections and has
 * been hitting Gemini's repetition-loop/incomplete-response bug at a high
 * failure rate, so nothing new gets added to that call. Never throws:
 * returns null on any failure, same "extras are optional, the trip itself
 * isn't" pattern as the live FX rate and Unsplash images.
 */
async function getTripExtras(formData, attractionNames, destinationName = formData.destination) {
  const prompt = `
Give practical extra info for a trip from ${formData.departureCity} to ${destinationName}:
- visaInfo: the real visa requirement for a traveler from ${formData.departureCity}'s country entering ${destinationName} (e-visa / visa-free / visa-on-arrival / visa-required), with brief processing guidance.
- simInfo: whether to get a local SIM/eSIM or use roaming, with rough cost and where to get one.
- phrasebook: 4-6 useful phrases in the local language of ${destinationName}, each with a rough phonetic pronunciation.
- bookInAdvance: 2-4 things worth booking ahead for this specific trip, drawn from these actual attractions: ${attractionNames.join(", ") || "none listed"}.
- attractionPhotoTips: for each of these attractions, one short "best photo spot" tip: ${attractionNames.join(", ") || "none listed"}. The "name" field must exactly match one of these names.
Every field must be real and specific to ${destinationName} — never placeholder text.
`.trim();

  try {
    const raw = await generateCompletion({
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.6,
      maxTokens: 2000,
      json: true,
      schema: tripExtrasSchema,
      model: MODEL_SMALL,
      thinkingLevel: "MINIMAL",
    });
    return JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.debug("Trip extras call failed (non-fatal):", err);
    return null;
  }
}

/**
 * Generates a full trip plan (itinerary + packing list + planner + flights +
 * food + shopping + currency/exchange tips), gated by a budget feasibility
 * pre-check. Throws BudgetTooLowError if the budget is unrealistic — the
 * caller should catch this specifically to show a warning instead of a plan.
 *
 * @param {Object} formData
 * @param {(text: string) => void} [onProgress] - called with the raw
 *   accumulated JSON text so far as it streams in, for a live progress
 *   preview. Only wired to the main plan call — the two feasibility/
 *   estimate calls are short enough that a spinner is fine.
 * @returns {Promise<Object>} parsed trip plan with an id
 */
async function generateSingleDestinationTripPlan(formData, onProgress) {
  // If the amount came from a picked category (not hand-typed), skip the
  // feasibility check entirely — the category itself already defines what's
  // realistic, and re-checking it against itself is redundant (and risks
  // the same kind of arithmetic mismatch we've already seen elsewhere).
  if (!formData.budgetFromCategory) {
    logger.info("Checking budget feasibility for", formData.destination);

    const feasibility = await checkBudgetFeasibility(formData);

    if (feasibility.feasible === false) {
      throw new BudgetTooLowError(feasibility);
    }
  }

  const prompt = buildPrompt(formData);

  logger.info("Generating trip plan for", formData.destination);

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    // Lowered from 0.7 — this call has repeatedly hit Gemini's repetition-
    // loop decoding bug live (see RepetitionLoopError/IncompleteResponseError
    // in gemini.js), sometimes on 2 of 3 attempts in a single generate call.
    // Higher temperature makes the decoder more likely to wander into a
    // self-reinforcing degenerate loop in the first place; 0.5 trades a
    // little creative variety for meaningfully more stable output on what's
    // largely factual travel content anyway.
    temperature: 0.5,
    // Gemini's "thinking" tokens draw from this same budget before the
    // visible JSON is written (see generateCompletion's thinkingLevel doc).
    // 10000, then 16000, both still truncated mid-generation on genuinely
    // detailed trips (Bangkok, then Seoul — the Seoul one hadn't even
    // reached planner/attractions/flights/food/shopping yet, still stuck in
    // packingList) — the per-field length estimate this was originally
    // sized against was just wrong for how verbose a real, high-quality
    // multi-clause note/description turns out to be at scale across the
    // whole schema. Gemini doesn't reject a large maxTokens upfront the way
    // Groq's TPM cap did (already confirmed: 16000 ran to completion-or-cutoff,
    // never a request-too-large error), so there's no real downside to
    // being generous — a typical trip finishes well under this regardless,
    // it only matters for verbose ones. Both models support up to 65,536.
    maxTokens: 32000,
    json: true,
    schema: TRIP_PLAN_SCHEMA,
    onChunk: onProgress,
    // If MODEL_LARGE's daily quota is exhausted, automatically try the
    // fallback model instead of failing the whole generation for the rest
    // of the day — Gemini enforces quota per-model, so it has its own
    // separate allowance. See generateCompletion's docs for the caveats
    // (unverified availability/quality in production so far).
    fallbackModel: MODEL_FALLBACK,
    // This prompt asks for a LOT in one shot (12 months of weather, a full
    // itinerary, attractions, food, shopping, currency info, ...). Went to
    // "MEDIUM" briefly to fix lazy placeholder text ("reason text") on
    // less-prominent fields, but that traded away budget headroom (see
    // above) *and* added real latency — thinking tokens take time to
    // generate too, on top of eating into the JSON's own budget. The
    // explicit "never placeholder text" rule in this prompt's Rules section
    // is a second, independent defense against the same failure that
    // doesn't cost either budget or time, so it carries this alone now.
    thinkingLevel: "LOW",
  });

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse AI response as JSON:", err, raw);
    throw new Error("AI returned an unexpected format. Please try again.");
  }

  const attractionNames = (parsed.attractions || []).map((a) => a.name);
  const localCode = parsed.currencyInfo?.localCurrencyCode;
  const [hero, attractionImages, liveRate, extras] = await Promise.all([
    getDestinationHero(formData.destination).catch(() => null),
    getAttractionImages(attractionNames, formData.destination).catch(
      () => []
    ),
    // Best-effort upgrade over the AI's guessed exchange rate — only kicks
    // in for currencies Frankfurter actually covers (~30 major ones), and
    // silently keeps the AI's estimate otherwise (see fx.js).
    parsed.currencyInfo?.isForeign && localCode
      ? getExchangeRate(formData.currency, localCode)
      : Promise.resolve(null),
    getTripExtras(formData, attractionNames),
  ]);

  const photoTipByName = new Map(
    (extras?.attractionPhotoTips || []).map((t) => [t.name.toLowerCase(), t.tip])
  );
  const attractionsWithImages = (parsed.attractions || []).map(
    (attraction, idx) => ({
      ...attraction,
      image: attractionImages[idx] || null,
      photoTip: photoTipByName.get(attraction.name.toLowerCase()) || null,
    })
  );

  if (liveRate != null && parsed.currencyInfo) {
    parsed.currencyInfo.oneUnitOfInputCurrencyInLocal = liveRate;
    parsed.currencyInfo.exchangeRateNote = "live rate";
  }

  return {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    input: formData,
    ...parsed,
    attractions: attractionsWithImages,
    heroImage: hero,
    visaInfo: extras?.visaInfo || null,
    simInfo: extras?.simInfo || null,
    phrasebook: extras?.phrasebook || null,
    bookInAdvance: extras?.bookInAdvance || null,
  };
}

/**
 * Generates a full trip plan. Dispatches to the untouched single-destination
 * path above when there's exactly one stop (or `destinations` isn't present
 * at all, e.g. a caller that hasn't been updated for multi-stop yet) —
 * same calls, same quota cost, same behavior as before this feature existed.
 * Only routes to the multi-stop path (see generateMultiStopTripPlan below)
 * when the user actually asked for a 2nd+ destination.
 * @param {Object} formData
 * @param {(text: string) => void} [onProgress]
 * @returns {Promise<Object>} parsed trip plan with an id
 */
export async function generateTripPlan(formData, onProgress) {
  const destinationCount = formData.destinations?.length ?? 1;
  if (destinationCount <= 1) {
    return generateSingleDestinationTripPlan(formData, onProgress);
  }
  return generateMultiStopTripPlan(formData, onProgress);
}

/**
 * Splits a trip's total days across its destinations, in route order, into
 * inclusive day-number ranges — e.g. [{name: "KL", days: 4}, {name: "SG",
 * days: 3}] becomes [{name: "KL", startDay: 1, endDay: 4, days: 4}, {name:
 * "SG", startDay: 5, endDay: 7, days: 3}]. Exported for reuse by the form
 * (leg-estimate preview) and the weather/itinerary rendering.
 */
export function computeDayRanges(destinations) {
  let start = 1;
  return destinations.map((d) => {
    const days = Number(d.days);
    const range = { name: d.name, startDay: start, endDay: start + days - 1, days };
    start += days;
    return range;
  });
}

/**
 * Multi-stop variant of checkBudgetFeasibility — kept as a SEPARATE
 * function (rather than extending checkBudgetFeasibility itself) so the
 * single-destination path above stays completely untouched. Reasons about
 * the whole route's cost instead of one place: per-stop accommodation/food
 * plus inter-city transport between stops.
 */
async function checkMultiStopBudgetFeasibility({
  destinations,
  departureCity,
  budget,
  currency,
  pax,
  flightsIncluded,
  estimatedLegs,
}) {
  const totalDays = destinations.reduce((sum, d) => sum + Number(d.days), 0);
  const routeDescription = destinations
    .map((d) => `${d.name} (${d.days} day${Number(d.days) === 1 ? "" : "s"})`)
    .join(" -> ");
  const legsHint = (estimatedLegs || [])
    .map(
      (leg) =>
        `${leg.from} -> ${leg.to}: rough geometric estimate ~${Math.round(leg.hours)}h by ${
          leg.mode === "flight" ? "flight" : "ground transport"
        } (${Math.round(leg.distanceKm)}km straight-line — use your own knowledge of typical real fares/modes for these specific places instead of this rough number)`
    )
    .join("\n");

  const prompt = `
Assess the realistic minimum cost for this MULTI-DESTINATION trip. Be strict
and honest — do not be generous or optimistic, but also do not inflate
numbers. Base this on real typical costs for each stop at budget-tier (not
luxury) choices.

- Route, in order: ${routeDescription}
- Departure city: ${flightsIncluded ? departureCity : "N/A (flights excluded)"}
- Total budget: ${budget} ${currency}
- Travelers: ${pax}
- Total duration: ${totalDays} days across ${destinations.length} stops
- Flights included in budget: ${flightsIncluded ? "yes" : "no"}
${legsHint ? `\nRough inter-city leg estimates (geometric, not authoritative):\n${legsHint}` : ""}

Work this out category by category, being careful and explicit about whether
a figure is PER PERSON or PER GROUP, and whether it's PER NIGHT/DAY or a
TOTAL. Accommodation is normally priced PER ROOM PER NIGHT (one room can
sleep 2-3 people, so do not multiply room cost by every traveler) — work out
how many rooms ${pax} traveler(s) actually need, and account for each stop's
own accommodation cost level separately since they can differ a lot.

Respond ONLY with JSON in this exact shape:
{
  "breakdown": [
    { "category": "Accommodation", "perUnitCost": 0, "unit": "per room per night", "units": 0, "subtotal": 0 },
    { "category": "Food", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Local transport", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Inter-city transport", "perUnitCost": 0, "unit": "per person, one leg", "units": ${Math.max(destinations.length - 1, 0) * pax}, "subtotal": 0 },
    { "category": "Activities/entry fees", "perUnitCost": 0, "unit": "per person for the trip", "units": 0, "subtotal": 0 }${
      flightsIncluded
        ? `,\n    { "category": "Flights", "perUnitCost": 0, "unit": "per person round-trip", "units": ${pax}, "subtotal": 0 }`
        : ""
    }
  ],
  "minimumRealisticBudget": 0,
  "currency": "${currency}",
  "reason": "1-2 sentences explaining the total, mentioning the biggest cost driver (often inter-city transport for a spread-out route)"
}

Rules:
- Each "subtotal" MUST equal perUnitCost × units — check your own multiplication.
- minimumRealisticBudget MUST equal the sum of all "subtotal" values in breakdown. Add them up yourself, don't estimate separately.
- "Inter-city transport" must cover ALL ${Math.max(destinations.length - 1, 0)} hop(s) between consecutive stops in the route above, for all ${pax} traveler(s) combined.
- All figures in ${currency}, for the TOTAL trip (all ${pax} traveler(s), all ${totalDays} day(s)) unless a line item says otherwise.
- Do not judge feasibility yourself — just give the honest, correctly-summed minimum figure.
`.trim();

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
    maxTokens: 1800,
    json: true,
    schema: FEASIBILITY_SCHEMA,
    model: MODEL_SMALL,
    thinkingLevel: "MINIMAL",
  });

  let result;
  try {
    result = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse multi-stop feasibility check:", err, raw);
    return { feasible: true };
  }

  const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
  const recomputedSubtotals = breakdown.map((line) => {
    const perUnit = Number(line.perUnitCost);
    const units = Number(line.units);
    const subtotal =
      Number.isFinite(perUnit) && Number.isFinite(units)
        ? perUnit * units
        : Number(line.subtotal) || 0;
    return { ...line, subtotal };
  });
  const recomputedTotal = recomputedSubtotals.reduce(
    (sum, line) => sum + (Number(line.subtotal) || 0),
    0
  );
  const fallback = Number(result.minimumRealisticBudget);
  const minimum =
    recomputedSubtotals.length > 0 && recomputedTotal > 0 ? recomputedTotal : fallback;
  const feasible = !Number.isFinite(minimum) || Number(budget) >= minimum * 0.95;

  return {
    feasible,
    minimumRealisticBudget: Number.isFinite(minimum) ? Math.round(minimum) : null,
    breakdown: recomputedSubtotals,
    currency: result.currency || currency,
    reason: result.reason,
  };
}

/**
 * Multi-stop variant of estimateBudgetForCategory (see that function for
 * the overall approach) — used by TripForm's quick-fill category buttons
 * once 2+ destinations are entered. Kept separate from the single-
 * destination version for the same reason as checkMultiStopBudgetFeasibility.
 */
export async function estimateMultiStopBudgetForCategory({
  destinations,
  departureCity,
  currency,
  pax,
  flightsIncluded,
  budgetCategory,
}) {
  const category = BUDGET_CATEGORIES[budgetCategory];
  if (!category) {
    throw new Error("Unknown budget category.");
  }

  const totalDays = destinations.reduce((sum, d) => sum + Number(d.days), 0);
  const routeDescription = destinations
    .map((d) => `${d.name} (${d.days} day${Number(d.days) === 1 ? "" : "s"})`)
    .join(" -> ");

  const prompt = `
Estimate a realistic TOTAL trip cost for the following MULTI-DESTINATION
trip, at a "${category.label}" comfort level: ${category.tier}.

- Route, in order: ${routeDescription}
- Departure city: ${flightsIncluded ? departureCity : "N/A (flights excluded)"}
- Travelers: ${pax}
- Total duration: ${totalDays} days across ${destinations.length} stops
- Flights included in total: ${flightsIncluded ? "yes" : "no"}

Work this out category by category (accommodation is per ROOM per night,
account for each stop's own cost level separately since they can differ a
lot — work out how many rooms ${pax} traveler(s) actually need, don't
multiply room cost by every traveler), being careful with your
multiplication.

Respond ONLY with JSON in this exact shape:
{
  "breakdown": [
    { "category": "Accommodation", "perUnitCost": 0, "unit": "per room per night", "units": 0, "subtotal": 0 },
    { "category": "Food", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Local transport", "perUnitCost": 0, "unit": "per person per day", "units": 0, "subtotal": 0 },
    { "category": "Inter-city transport", "perUnitCost": 0, "unit": "per person, one leg", "units": ${Math.max(destinations.length - 1, 0) * pax}, "subtotal": 0 },
    { "category": "Activities/experiences", "perUnitCost": 0, "unit": "per person for the trip", "units": 0, "subtotal": 0 }${
      flightsIncluded
        ? `,\n    { "category": "Flights", "perUnitCost": 0, "unit": "per person round-trip", "units": ${pax}, "subtotal": 0 }`
        : ""
    }
  ],
  "estimatedBudget": 0,
  "currency": "${currency}"
}

Rules:
- Each "subtotal" MUST equal perUnitCost × units — check your own multiplication.
- estimatedBudget MUST equal the sum of all "subtotal" values. Add them up yourself.
- "Inter-city transport" must cover ALL ${Math.max(destinations.length - 1, 0)} hop(s) between consecutive stops, for all ${pax} traveler(s) combined.
- All figures in ${currency}, for the TOTAL trip (all ${pax} traveler(s), all ${totalDays} day(s)) unless a line item says otherwise.
`.trim();

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
    maxTokens: 1800,
    json: true,
    schema: BUDGET_ESTIMATE_SCHEMA,
    model: MODEL_SMALL,
    thinkingLevel: "MINIMAL",
  });

  let result;
  try {
    result = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse multi-stop budget category estimate:", err, raw);
    throw new Error("Couldn't estimate a budget for that category. Please try again.");
  }

  const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
  const recomputed = breakdown.map((line) => {
    const perUnit = Number(line.perUnitCost);
    const units = Number(line.units);
    const subtotal =
      Number.isFinite(perUnit) && Number.isFinite(units)
        ? perUnit * units
        : Number(line.subtotal) || 0;
    return { ...line, subtotal };
  });
  const total = recomputed.reduce((sum, line) => sum + (Number(line.subtotal) || 0), 0);
  const fallback = Number(result.estimatedBudget);
  const estimatedBudget = recomputed.length > 0 && total > 0 ? total : fallback;

  return {
    estimatedBudget: Number.isFinite(estimatedBudget) ? Math.round(estimatedBudget) : null,
    breakdown: recomputed,
    currency: result.currency || currency,
  };
}

/**
 * Builds the prompt for ONE stop's own content call (weather, attractions,
 * food, shopping, currency, safety, emergency info) — deliberately scoped
 * to that destination alone; the itinerary/budget/flights/packing list are
 * handled separately by buildItineraryBudgetPrompt since those are
 * cross-cutting across the whole route.
 */
function buildPerDestinationPrompt(destinationName, formData) {
  const { currency, pax, tripType, budgetCategory } = formData;
  const tripTypeContext = TRIP_TYPE_LABELS[tripType] || "a general traveler";
  const categoryInfo = BUDGET_CATEGORIES[budgetCategory];

  return `
This is ONE STOP within a multi-destination trip — give real, practical
content for THIS destination only: ${destinationName}. Other stops on the
trip are handled separately; don't reference them.
- Travelers: ${pax}
- Trip type: this trip is for ${tripTypeContext}. Tailor attraction/food/shopping picks to suit this group.
- Comfort level: ${categoryInfo ? `a "${categoryInfo.label}" trip — ${categoryInfo.tier}` : "a typical range appropriate for this trip's overall budget"}.
- Prices should be in ${currency}.

Respond ONLY with a JSON object in this exact shape:
{
  "weather": {
    "months": [
      { "month": "January", "avgHighC": 0, "avgLowC": 0, "conditions": "e.g. Hot and humid, Cool and dry, Monsoon rains", "rating": "best | good | okay | avoid", "bestFor": "1 short sentence on what's best to do/try that month specifically, or null if nothing month-specific stands out" }
    ],
    "bestMonthsSummary": "1-2 sentences naming the best window(s) to visit and why",
    "avoidMonthsSummary": "1-2 sentences on months to avoid and why, or null if there's no notably bad time"
  },
  "attractions": [
    {
      "name": "Attraction name",
      "category": "Landmark | Museum | Nature | Religious | Market | Viewpoint",
      "description": "2-3 sentence description of what it is and why visit, mentioning why it suits ${tripType ? "this group" : "travelers"}",
      "historicalSignificance": "1-3 sentences of real historical/cultural context, or null if the place has no notable history",
      "bestTimeToVisit": "e.g. Early morning, Sunset",
      "estimatedDuration": "e.g. 2-3 hours"
    }
  ],
  "accommodation": {
    "tier": "e.g. 3-star hotel, boutique guesthouse, hostel dorm — matching the comfort level above",
    "pricePerNightLow": 0,
    "pricePerNightHigh": 0,
    "unit": "per room per night",
    "areaRecommendation": "1 sentence naming a good area/neighborhood to stay in ${destinationName} and why, or null",
    "notes": "1-2 sentences, e.g. what this tier typically includes, when to book, seasonal price swings, or null"
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
      "notes": "1 sentence on what budget vs mid-range means here"
    }
  },
  "shopping": [
    { "item": "Item/craft name", "description": "1-2 sentences on what it is and why it's a good buy here", "whereToBuy": "e.g. local market name or area", "priceRange": "approx range in ${currency}" }
  ],
  "currencyInfo": {
    "isForeign": true or false,
    "localCurrencyName": "e.g. South Korean Won",
    "localCurrencyCode": "e.g. KRW",
    "oneUnitOfInputCurrencyInLocal": 0,
    "exchangeRateNote": "approximate, rates fluctuate — 1-2 words max, e.g. 'approx.'",
    "recommendation": "carry-cash | get-local-currency | card-friendly",
    "recommendationReason": "1-2 sentences on why, specific to ${destinationName}",
    "airportExchangeWarning": "1-2 sentences on whether departure/arrival airport currency exchange counters are notably costly here, or null if not a particular concern",
    "betterExchangeOptions": ["option1", "option2"],
    "cardTips": "1-2 sentences on debit/credit card acceptance and foreign transaction fees to watch for"
  },
  "bewareOf": [
    { "title": "Short name of the scam/hazard/pitfall", "description": "1-2 sentences on what it is and how to avoid it, specific to ${destinationName}" }
  ],
  "emergencyInfo": {
    "generalEmergencyNumber": "the real emergency number(s) used in ${destinationName}",
    "embassyNote": "1-2 sentences on how a traveler can find/contact their home country's embassy or consulate in ${destinationName} if needed"
  }
}

Rules:
- weather.months must have exactly 12 entries, one per calendar month, with realistic typical temperature averages in Celsius for ${destinationName}.
- rating reflects how good that month is for tourism (weather + crowds + typical conditions) — "best" for the ideal window, "avoid" for genuinely bad months, "good"/"okay" in between.
- bestFor should be genuinely month-specific — don't repeat generic sightseeing advice across months. Use null if nothing distinct applies.
- Base weather on ${destinationName}'s real typical climate — historical seasonal averages, not a live forecast.
- attractions should list 5-8 real, well-known places in ${destinationName} — mix of categories, not all the same type.
- historicalSignificance must be factually grounded (real dates, rulers, events) where genuine, or null otherwise — never invent history.
- accommodation.pricePerNightLow/High is PER ROOM (not per person), realistic for ${destinationName} at the comfort level above, in ${currency}.
- food.dishes should list 5-8 real, well-known local dishes/specialties actually associated with ${destinationName}.
- food.beverages should list 3-5 real local drinks.
- mealCostEstimate amounts are PER PERSON, per meal, in ${currency}, realistic for ${destinationName}'s cost of living.
- shopping should list 4-6 real local products/crafts/souvenirs genuinely associated with ${destinationName}.
- currencyInfo.isForeign should be false only if ${destinationName}'s local currency IS ${currency}. If false, other currencyInfo fields may be null.
- oneUnitOfInputCurrencyInLocal must be a plain number: how many units of the local currency you get for 1 unit of ${currency}.
- bewareOf should list 3-5 real, specific things to watch out for in ${destinationName} — or say plainly if it's genuinely very safe rather than inventing generic ones.
- emergencyInfo.generalEmergencyNumber must be the actual real emergency number(s) used in ${destinationName} — never invent a plausible-looking number.
- Every text field must contain real, specific content about ${destinationName} — never placeholder text. Use null where a field genuinely doesn't apply.
- Keep JSON valid — no trailing commas, no comments.
`.trim();
}

/**
 * Builds the prompt for the ONE cross-cutting call covering the whole
 * multi-stop route: day-by-day itinerary (each day tagged with which stop
 * it's in), the overall budget, open-jaw flights, inter-city legs, and a
 * single trip-wide packing list.
 */
function buildItineraryBudgetPrompt(formData, legEstimates) {
  const { destinations, departureCity, budget, currency, pax, flightsIncluded, tripType } = formData;
  const tripTypeContext = TRIP_TYPE_LABELS[tripType] || "a general traveler";
  const totalDays = destinations.reduce((sum, d) => sum + Number(d.days), 0);
  const ranges = computeDayRanges(destinations);
  const routeDescription = ranges
    .map((r) => `Days ${r.startDay}-${r.endDay}: ${r.name} (${r.days} day${r.days === 1 ? "" : "s"})`)
    .join("; ");
  const firstStop = destinations[0].name;
  const lastStop = destinations[destinations.length - 1].name;
  const legsHint = (legEstimates || [])
    .map(
      (leg) =>
        `${leg.from} -> ${leg.to}: rough geometric estimate ~${Math.round(leg.hours)}h by ${
          leg.mode === "flight" ? "flight" : "ground transport"
        } (~${Math.round(leg.distanceKm)}km straight-line — use your own real knowledge of typical fares/modes/durations for these specific places instead of this rough number)`
    )
    .join("\n");

  return `
Plan a MULTI-DESTINATION trip with these details:
- Route, in order: ${routeDescription}
- Total budget: ${budget} ${currency}
- Travelers: ${pax}
- Trip type: this trip is for ${tripTypeContext}. Tailor the itinerary and tips to suit this group.
- Total duration: ${totalDays} days across ${destinations.length} stops
- Flights: ${
    flightsIncluded
      ? `estimate an OPEN-JAW round trip: outbound from ${departureCity} to ${firstStop}, and a SEPARATE return from ${lastStop} back to ${departureCity} (NOT a round trip to a single place) — include both in the budget`
      : "traveler is arranging international flights separately, exclude that cost from budget"
  }
${legsHint ? `\nRough inter-city leg estimates between consecutive stops (geometric, not authoritative):\n${legsHint}` : ""}

Respond ONLY with a JSON object in this exact shape:
{
  "itinerary": [
    {
      "day": 1,
      "destination": "which stop this day is in — must exactly match one of the route's destination names above",
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
      { "category": "Inter-city transport", "amount": 0, "percentage": 0 },
      { "category": "Activities", "amount": 0, "percentage": 0 },
      { "category": "Flights", "amount": 0, "percentage": 0 },
      { "category": "Misc/Buffer", "amount": 0, "percentage": 0 }
    ],
    "tips": ["tip1", "tip2", "tip3"],
    "totalEstimate": 0
  },
  "flights": ${
    flightsIncluded
      ? `{
    "departureCity": "${departureCity}",
    "destination": "${firstStop}",
    "returnFromDestination": "${lastStop}",
    "outbound": { "priceRangeLow": 0, "priceRangeHigh": 0, "typicalAirlines": ["airline1", "airline2"], "notes": "e.g. typical duration, layover pattern" },
    "returnFlight": { "priceRangeLow": 0, "priceRangeHigh": 0, "typicalAirlines": ["airline1", "airline2"], "notes": "e.g. typical duration, layover pattern" },
    "bookingTip": "1-2 sentences, e.g. best time to book, cheaper nearby airports"
  }`
      : "null"
  },
  "interCityLegs": [
    { "from": "stop name", "to": "next stop name", "mode": "flight | train | bus | ferry | car", "priceRangeLow": 0, "priceRangeHigh": 0, "typicalDurationHours": 0, "notes": "1-2 sentences, e.g. typical route/operator, booking tip" }
  ]
}

Rules:
- itinerary must have exactly ${totalDays} day entries total, numbered 1 through ${totalDays}, each with a "destination" matching the route above for that day number.
- Every stop must get real, distinct day-by-day content — don't reuse the same activities across stops.
- interCityLegs must have exactly ${Math.max(destinations.length - 1, 0)} entries, one per consecutive pair of stops in route order, each with a realistic mode/price/duration for THAT specific pair of places (not a generic guess) — a short hop between nearby places and a long-haul crossing should look very different from each other.
- budgetBreakdown amounts must sum to approximately the total budget (${budget} ${currency}), built bottom-up from what THIS specific itinerary and route actually cost — not arbitrary round percentages.
- "Inter-city transport" in budgetBreakdown must cover the total cost of ALL interCityLegs above, for all ${pax} traveler(s).
- If flights are included, "Flights" must cover the international outbound+return fares for all ${pax} traveler(s) for the open-jaw route described above.
- If flights are excluded, omit or zero the "Flights" category and set "flights" to null.
- packingList must account for EVERY stop's typical climate for the time of year — call out layering/climate differences explicitly if stops differ a lot (e.g. tropical heat then a cooler city).
- Every text field must contain real, specific content — never placeholder or filler text. If a field genuinely doesn't apply, use null instead of a placeholder.
- Keep JSON valid — no trailing commas, no comments.
`.trim();
}

/**
 * Generates one destination's own content (weather, attractions, food,
 * shopping, currency, safety, emergency info, plus the same visa/SIM/
 * phrasebook/book-ahead/photo-tip extras the single-destination path gets)
 * — mirrors generateSingleDestinationTripPlan's merge logic, just scoped to
 * one stop. Never throws: on failure, returns a `failed: true` placeholder
 * so one flaky stop doesn't take down the whole multi-stop trip.
 */
async function generatePerDestinationResult(destinationName, formData) {
  try {
    const raw = await generateCompletion({
      system: SYSTEM_PROMPT,
      prompt: buildPerDestinationPrompt(destinationName, formData),
      temperature: 0.5,
      maxTokens: 16000,
      json: true,
      schema: PER_DESTINATION_SCHEMA,
      model: MODEL_LARGE,
      fallbackModel: MODEL_FALLBACK,
      thinkingLevel: "LOW",
    });
    const parsed = JSON.parse(cleanJsonResponse(raw));

    const attractionNames = (parsed.attractions || []).map((a) => a.name);
    const [hero, attractionImages, liveRate, extras] = await Promise.all([
      getDestinationHero(destinationName).catch(() => null),
      getAttractionImages(attractionNames, destinationName).catch(() => []),
      parsed.currencyInfo?.isForeign && parsed.currencyInfo?.localCurrencyCode
        ? getExchangeRate(formData.currency, parsed.currencyInfo.localCurrencyCode)
        : Promise.resolve(null),
      getTripExtras(formData, attractionNames, destinationName),
    ]);

    const photoTipByName = new Map(
      (extras?.attractionPhotoTips || []).map((t) => [t.name.toLowerCase(), t.tip])
    );
    const attractionsWithImages = (parsed.attractions || []).map((attraction, idx) => ({
      ...attraction,
      destination: destinationName,
      image: attractionImages[idx] || null,
      photoTip: photoTipByName.get(attraction.name.toLowerCase()) || null,
    }));

    if (liveRate != null && parsed.currencyInfo) {
      parsed.currencyInfo.oneUnitOfInputCurrencyInLocal = liveRate;
      parsed.currencyInfo.exchangeRateNote = "live rate";
    }

    return {
      destination: destinationName,
      failed: false,
      heroImage: hero,
      accommodation: parsed.accommodation,
      weather: parsed.weather,
      attractions: attractionsWithImages,
      food: parsed.food
        ? {
            ...parsed.food,
            dishes: (parsed.food.dishes || []).map((d) => ({ ...d, destination: destinationName })),
          }
        : null,
      shopping: (parsed.shopping || []).map((s) => ({ ...s, destination: destinationName })),
      currencyInfo: parsed.currencyInfo,
      bewareOf: parsed.bewareOf,
      emergencyInfo: parsed.emergencyInfo,
      visaInfo: extras?.visaInfo || null,
      simInfo: extras?.simInfo || null,
      phrasebook: extras?.phrasebook || null,
      bookInAdvance: extras?.bookInAdvance || null,
    };
  } catch (err) {
    logger.error(`Per-destination content generation failed for ${destinationName}:`, err);
    return {
      destination: destinationName,
      failed: true,
      heroImage: null,
      weather: null,
      accommodation: null,
      attractions: [],
      food: null,
      shopping: [],
      currencyInfo: null,
      bewareOf: null,
      emergencyInfo: null,
      visaInfo: null,
      simInfo: null,
      phrasebook: null,
      bookInAdvance: null,
    };
  }
}

/**
 * The one cross-cutting call for a multi-stop trip — itinerary, budget,
 * flights, packing list, inter-city legs. If this fails, the whole
 * generateMultiStopTripPlan() call fails — same as the single-destination
 * path's main call today, there's no meaningful partial trip without an
 * itinerary.
 */
async function generateItineraryAndBudget(formData, onProgress) {
  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt: buildItineraryBudgetPrompt(formData, formData.estimatedLegs),
    temperature: 0.5,
    maxTokens: 24000,
    json: true,
    schema: ITINERARY_AND_BUDGET_SCHEMA,
    onChunk: onProgress,
    fallbackModel: MODEL_FALLBACK,
    thinkingLevel: "LOW",
  });

  try {
    return JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse itinerary/budget response as JSON:", err, raw);
    throw new Error("AI returned an unexpected format. Please try again.");
  }
}

/**
 * Multi-stop trip generation (2+ destinations) — see the plan's "AI call
 * orchestration" section for the full reasoning. Feasibility gates the rest
 * (same pattern as the single-destination path); the N per-destination
 * content calls and the one cross-cutting itinerary/budget call then run
 * in parallel, trading a little cross-call consistency for latency close to
 * a single-destination generation instead of N+1x it.
 */
async function generateMultiStopTripPlan(formData, onProgress) {
  const { destinations } = formData;

  if (!formData.budgetFromCategory) {
    logger.info("Checking multi-stop budget feasibility for", formData.destinationLabel);
    const feasibility = await checkMultiStopBudgetFeasibility(formData);
    if (feasibility.feasible === false) {
      throw new BudgetTooLowError(feasibility);
    }
  }

  logger.info("Generating multi-stop trip plan for", formData.destinationLabel);

  const [perDestinationResults, crossCutting] = await Promise.all([
    Promise.all(destinations.map((d) => generatePerDestinationResult(d.name, formData))),
    generateItineraryAndBudget(formData, onProgress),
  ]);

  return {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    input: formData,
    heroImage: perDestinationResults.find((r) => r.heroImage)?.heroImage || null,
    destinations,
    perDestination: perDestinationResults,
    itinerary: crossCutting.itinerary,
    planner: crossCutting.planner,
    flights: crossCutting.flights,
    packingList: crossCutting.packingList,
    interCityLegs: crossCutting.interCityLegs,
  };
}

/**
 * Retries one stop's whole content call (weather/attractions/food/shopping/
 * currency/bewareOf/emergencyInfo/visa/SIM/phrasebook) — used by the
 * "Couldn't load info for this stop — Retry" affordance a multi-stop trip
 * shows when a per-destination call ultimately failed during generation.
 * Never throws (see generatePerDestinationResult) — a repeat failure just
 * comes back as another `failed: true` result.
 */
export async function regenerateDestinationContent(destinationName, formData) {
  return generatePerDestinationResult(destinationName, formData);
}

/**
 * Section-level regeneration: redo just one part of an already-generated
 * trip (e.g. a repetitive attraction list) instead of the whole plan.
 * Each entry describes how to build the focused prompt/schema for that
 * section and, where useful, how to steer the model away from repeating
 * what's already there.
 */
// `buildPrompt` takes an optional `destinationName` — passed for a
// multi-stop trip's per-destination sections (attractions/weather/food/
// shopping/bewareOf/emergencyInfo), omitted for a single-destination trip
// (falls back to formData.destination, i.e. today's exact existing
// behavior) and for packingList (always trip-wide regardless of stop count).
const SECTION_REGENERATORS = {
  attractions: {
    schema: { type: "ARRAY", items: attractionSchema },
    buildPrompt: (trip, formData, destinationName) => {
      const destination = destinationName || formData.destination;
      const existingNames = destinationName
        ? (trip.perDestination?.find((d) => d.destination === destinationName)?.attractions || []).map((a) => a.name)
        : (trip.attractions || []).map((a) => a.name);
      const tripTypeContext = TRIP_TYPE_LABELS[formData.tripType] || "a general traveler";
      return `
Suggest 5-8 real, well-known attractions in ${destination}, suited to ${tripTypeContext}. Mix of categories (Landmark, Museum, Nature, Religious, Market, Viewpoint), not all the same type.
${
  existingNames.length
    ? `Do NOT repeat any of these already-suggested places: ${existingNames.join(", ")}. Find different real places instead.`
    : ""
}
historicalSignificance must be factually grounded (real dates, rulers, events) where the place has genuine history, or null otherwise — do not invent history.
Every field must contain real, specific content about ${destination} — never placeholder or filler text.
`.trim();
    },
  },
  weather: {
    schema: weatherSchema,
    buildPrompt: (trip, formData, destinationName) => {
      const destination = destinationName || formData.destination;
      return `
Give realistic typical seasonal weather for ${destination}, exactly 12 months (January through December), based on real historical climate averages — not a live forecast.
rating reflects how good that month is for tourism (weather + crowds + typical conditions) — "best" for the ideal window, "avoid" for genuinely bad months (monsoon, extreme heat/cold), "good"/"okay" in between.
bestFor should be genuinely month-specific (a real festival/event, a seasonal fruit/dish, a seasonal activity) — don't repeat generic sightseeing advice across months. Use null if nothing distinct applies that month.
`.trim();
    },
  },
  accommodation: {
    schema: accommodationSchema,
    buildPrompt: (trip, formData, destinationName) => {
      const destination = destinationName || formData.destination;
      const categoryInfo = BUDGET_CATEGORIES[formData.budgetCategory];
      return `
Give a realistic per-night hotel tariff for ${destination}, at ${
        categoryInfo ? `a "${categoryInfo.label}" comfort level: ${categoryInfo.tier}` : "a typical range appropriate for this trip's overall budget"
      }. pricePerNightLow/High is PER ROOM (not per person), in ${formData.currency}. Name a good area/neighborhood to stay, and note what this tier typically includes.
`.trim();
    },
  },
  food: {
    schema: foodSchema,
    buildPrompt: (trip, formData, destinationName) => {
      const destination = destinationName || formData.destination;
      return `
Suggest 5-8 real, well-known local dishes and 3-5 real local beverages actually associated with ${destination} — not generic dishes. mealCostEstimate amounts are PER PERSON per meal, in ${formData.currency}, realistic for ${destination}'s cost of living.
`.trim();
    },
  },
  shopping: {
    schema: { type: "ARRAY", items: shoppingItemSchema },
    buildPrompt: (trip, formData, destinationName) => {
      const destination = destinationName || formData.destination;
      return `
Suggest 4-6 real local products/crafts/souvenirs genuinely associated with ${destination}, with realistic price ranges in ${formData.currency}.
`.trim();
    },
  },
  packingList: {
    schema: packingListSchema,
    buildPrompt: (trip, formData) => {
      const multiStop = formData.destinations?.length > 1;
      const destinationText = multiStop
        ? formData.destinations.map((d) => d.name).join(", ")
        : formData.destination;
      return `
Build a packing list (clothing, documents, electronics, toiletries, misc) tailored to ${destinationText}'s typical climate and a ${formData.days}-day trip.${
        multiStop
          ? " This trip visits multiple places — call out layering/climate differences explicitly if they differ a lot (e.g. tropical heat then a cooler city)."
          : ""
      }
`.trim();
    },
  },
  bewareOf: {
    schema: { type: "ARRAY", items: bewareOfItemSchema, minItems: "3", maxItems: "6" },
    buildPrompt: (trip, formData, destinationName) => {
      const destination = destinationName || formData.destination;
      return `
List 3-5 real, specific things travelers should watch out for in ${destination} — common scams, safety concerns, cultural faux pas, or practical pitfalls. Be specific and honest — if ${destination} is genuinely very safe with few notable scams, say so plainly in one item rather than inventing generic ones that don't really apply.
`.trim();
    },
  },
  emergencyInfo: {
    schema: emergencyInfoSchema,
    buildPrompt: (trip, formData, destinationName) => {
      const destination = destinationName || formData.destination;
      return `
Give the real emergency contact number(s) used in ${destination} (e.g. a single unified number like "112", or split numbers like "100 Police / 101 Fire / 102 Ambulance" if the country uses separate ones — never invent a plausible-looking number), and 1-2 sentences of practical guidance for a traveler from ${formData.departureCity} on finding/contacting their home country's embassy or consulate in ${destination}.
`.trim();
    },
  },
};

/**
 * Regenerates one section of an existing trip plan (attractions, weather,
 * food, shopping, packingList, bewareOf, or emergencyInfo) without touching
 * the rest of the plan. Returns just the new section value — the caller
 * merges it into trip state and re-caches. `destinationName` scopes the
 * regeneration to one stop of a multi-destination trip; omitted for a
 * single-destination trip (unchanged behavior) and for packingList (always
 * trip-wide).
 */
export async function regenerateSection(sectionKey, trip, formData, destinationName) {
  const config = SECTION_REGENERATORS[sectionKey];
  if (!config) {
    throw new Error(`Unknown section: ${sectionKey}`);
  }

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt: config.buildPrompt(trip, formData, destinationName),
    temperature: 0.8,
    maxTokens: 3000,
    json: true,
    schema: config.schema,
    thinkingLevel: "LOW",
  });

  let result;
  try {
    result = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error(`Failed to parse regenerated ${sectionKey}:`, err, raw);
    throw new Error("Couldn't regenerate that section. Please try again.");
  }

  if (sectionKey === "attractions") {
    const destination = destinationName || formData.destination;
    const names = (Array.isArray(result) ? result : []).map((a) => a.name);
    const images = await getAttractionImages(names, destination).catch(() => []);
    return result.map((attraction, idx) => ({
      ...attraction,
      destination,
      image: images[idx] || null,
    }));
  }

  if (sectionKey === "food" && destinationName) {
    return {
      ...result,
      dishes: (result.dishes || []).map((d) => ({ ...d, destination: destinationName })),
    };
  }

  if (sectionKey === "shopping" && destinationName) {
    return (Array.isArray(result) ? result : []).map((s) => ({ ...s, destination: destinationName }));
  }

  return result;
}

/**
 * Regenerates a single day of the itinerary in place, keeping every other
 * day untouched. Shares context about the other days' themes so the model
 * doesn't repeat an activity already planned elsewhere in the trip.
 */
export async function regenerateItineraryDay(dayNumber, trip, formData) {
  const otherDays = (trip.itinerary || [])
    .filter((d) => d.day !== dayNumber)
    .map((d) => `Day ${d.day}: ${d.title}`)
    .join("; ");
  const tripTypeContext = TRIP_TYPE_LABELS[formData.tripType] || "a general traveler";
  // A multi-stop trip's days each belong to a specific destination (see
  // itineraryDaySchema) — look that up from the day being replaced rather
  // than assuming formData.destination, which for a multi-stop trip is only
  // ever the first stop.
  const existingDay = (trip.itinerary || []).find((d) => d.day === dayNumber);
  const destination = existingDay?.destination || formData.destination;

  const prompt = `
Plan day ${dayNumber} of a ${formData.days}-day trip, suited to ${tripTypeContext}. This day is in ${destination}. Give it a short theme title and Morning/Afternoon/Evening activities.
${otherDays ? `The other days in this trip already cover: ${otherDays}. Pick a different theme and different activities for day ${dayNumber} — don't repeat what's already planned on those days.` : ""}
Every field must contain real, specific content about ${destination} — never placeholder or filler text.
`.trim();

  const raw = await generateCompletion({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.8,
    maxTokens: 1500,
    json: true,
    schema: itineraryDaySchema,
    thinkingLevel: "LOW",
  });

  let result;
  try {
    result = JSON.parse(cleanJsonResponse(raw));
  } catch (err) {
    logger.error("Failed to parse regenerated itinerary day:", err, raw);
    throw new Error("Couldn't regenerate that day. Please try again.");
  }

  return { ...result, day: dayNumber, destination: result.destination || destination };
}