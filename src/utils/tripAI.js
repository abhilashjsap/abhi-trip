import { v4 as uuidv4 } from "uuid";
import { generateCompletion, MODEL_SMALL } from "./groq";
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
    maxTokens: 400,
    json: true,
    model: MODEL_SMALL,
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
    maxTokens: 400,
    json: true,
    model: MODEL_SMALL,
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
    "oneUnitOfInputCurrencyInLocal": 0,
    "exchangeRateNote": "approximate, rates fluctuate — 1-2 words max, e.g. 'approx.'",
    "recommendation": "carry-cash | get-local-currency | card-friendly",
    "recommendationReason": "1-2 sentences on why, specific to ${destination}",
    "airportExchangeWarning": "1-2 sentences on whether departure/arrival airport currency exchange counters are notably costly here, or null if not a particular concern",
    "betterExchangeOptions": ["option1 (e.g. local banks, ATMs on arrival, licensed exchange chains in the city)", "option2"],
    "cardTips": "1-2 sentences on debit/credit card acceptance and foreign transaction fees to watch for"
  }
}

Rules:
- weather.months must have exactly 12 entries, one per calendar month (January through December), with realistic typical temperature averages in Celsius for ${destination}.
- rating reflects how good that month is for tourism specifically (weather + crowds + typical conditions), not just raw temperature — "best" for the ideal window, "avoid" for genuinely bad months (monsoon, extreme heat/cold, etc.), "good"/"okay" in between.
- bestFor should be genuinely month-specific (a real festival/event that happens then, a seasonal fruit/dish in season, a seasonal activity like cherry blossoms or whale watching) — don't repeat generic sightseeing advice across every month. Use null if nothing distinct applies that month.
- Base weather on ${destination}'s real typical climate — these are historical seasonal averages, not a live forecast.
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
- oneUnitOfInputCurrencyInLocal must be a plain number: how many units of the local currency you get for 1 unit of ${currency} (e.g. if 1 INR = 18 MYR-equivalent-in-cents... just give the direct numeric rate, however small or large).
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
    temperature: 0.7,
    // Groq's TPM limit for openai/gpt-oss-120b on this tier is 8000, and it
    // counts prompt + maxTokens against that limit (not just actual usage).
    // This prompt runs ~2100-2300 tokens, so 6000 pushed the request over
    // 8000 and got rejected outright with a 413 before the model even ran.
    maxTokens: 5400,
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