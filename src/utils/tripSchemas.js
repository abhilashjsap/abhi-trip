// Gemini responseSchema definitions (https://ai.google.dev/api/generate-content#Schema).
// Mirrors the JSON shapes described in prose inside tripAI.js's prompts —
// schema enforces structural validity server-side, so the model can no
// longer return truncated/malformed JSON for these calls. Content-quality
// guidance ("5-8 real attractions", "use real place names") still has to
// live in the prompt text; a schema can only constrain shape, not accuracy.
//
// Field naming/behavior confirmed directly against the @google/genai SDK's
// type definitions: `type` values are uppercase strings (STRING, NUMBER,
// INTEGER, BOOLEAN, ARRAY, OBJECT), enum fields need both `format: "enum"`
// and an `enum` array, and minItems/maxItems are strings, not numbers.

const budgetBreakdownItemSchema = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING" },
    perUnitCost: { type: "NUMBER" },
    unit: { type: "STRING" },
    units: { type: "NUMBER" },
    subtotal: { type: "NUMBER" },
  },
  required: ["category", "perUnitCost", "unit", "units", "subtotal"],
};

export const BUDGET_ESTIMATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    breakdown: { type: "ARRAY", items: budgetBreakdownItemSchema },
    estimatedBudget: { type: "NUMBER" },
    currency: { type: "STRING" },
  },
  required: ["breakdown", "estimatedBudget", "currency"],
};

export const FEASIBILITY_SCHEMA = {
  type: "OBJECT",
  properties: {
    breakdown: { type: "ARRAY", items: budgetBreakdownItemSchema },
    minimumRealisticBudget: { type: "NUMBER" },
    currency: { type: "STRING" },
    reason: { type: "STRING" },
  },
  required: ["breakdown", "minimumRealisticBudget", "currency", "reason"],
};

const weatherMonthSchema = {
  type: "OBJECT",
  properties: {
    month: { type: "STRING" },
    avgHighC: { type: "NUMBER" },
    avgLowC: { type: "NUMBER" },
    conditions: { type: "STRING", maxLength: "120" },
    rating: {
      type: "STRING",
      format: "enum",
      enum: ["best", "good", "okay", "avoid"],
    },
    bestFor: { type: "STRING", nullable: true, maxLength: "150" },
  },
  required: ["month", "avgHighC", "avgLowC", "conditions", "rating"],
};

const activitySchema = {
  type: "OBJECT",
  properties: {
    time: { type: "STRING" },
    activity: { type: "STRING" },
    notes: { type: "STRING", nullable: true, maxLength: "300" },
  },
  required: ["time", "activity"],
};

export const itineraryDaySchema = {
  type: "OBJECT",
  properties: {
    day: { type: "INTEGER" },
    // Which stop this day belongs to, for multi-destination trips — a
    // transfer day is attributed to the destination the traveler wakes up
    // in that morning. Required (not just multi-stop-only) so single- and
    // multi-destination trips share one schema/shape; for a single
    // destination this is just always that one destination's name.
    destination: { type: "STRING" },
    title: { type: "STRING" },
    activities: { type: "ARRAY", items: activitySchema },
  },
  required: ["day", "destination", "title", "activities"],
};

export const attractionSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    category: { type: "STRING" },
    description: { type: "STRING", maxLength: "400" },
    historicalSignificance: { type: "STRING", nullable: true, maxLength: "400" },
    bestTimeToVisit: { type: "STRING" },
    estimatedDuration: { type: "STRING" },
  },
  required: ["name", "category", "description", "bestTimeToVisit", "estimatedDuration"],
};

const flightLegSchema = {
  type: "OBJECT",
  properties: {
    priceRangeLow: { type: "NUMBER" },
    priceRangeHigh: { type: "NUMBER" },
    typicalAirlines: { type: "ARRAY", items: { type: "STRING" } },
    notes: { type: "STRING", maxLength: "300" },
  },
  required: ["priceRangeLow", "priceRangeHigh", "typicalAirlines", "notes"],
};

const flightsSchema = {
  type: "OBJECT",
  nullable: true,
  properties: {
    departureCity: { type: "STRING" },
    // For a multi-destination trip this is the FIRST stop (where the
    // outbound leg arrives) — an open-jaw itinerary flies home from the
    // LAST stop instead of backtracking, hence returnFromDestination below.
    // For a single-destination trip they're the same place.
    destination: { type: "STRING" },
    returnFromDestination: { type: "STRING", nullable: true },
    outbound: flightLegSchema,
    returnFlight: flightLegSchema,
    bookingTip: { type: "STRING", maxLength: "300" },
  },
  required: ["departureCity", "destination", "outbound", "returnFlight", "bookingTip"],
};

// One inter-city hop for a multi-destination trip (e.g. Kuala Lumpur ->
// Singapore). Not part of flightsSchema since a hop isn't necessarily a
// flight — could be a train, bus, ferry, or car.
export const interCityLegSchema = {
  type: "OBJECT",
  properties: {
    from: { type: "STRING" },
    to: { type: "STRING" },
    mode: {
      type: "STRING",
      format: "enum",
      enum: ["flight", "train", "bus", "ferry", "car"],
    },
    priceRangeLow: { type: "NUMBER" },
    priceRangeHigh: { type: "NUMBER" },
    typicalDurationHours: { type: "NUMBER" },
    notes: { type: "STRING", maxLength: "300" },
  },
  required: ["from", "to", "mode", "priceRangeLow", "priceRangeHigh", "typicalDurationHours", "notes"],
};

const dishSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    type: { type: "STRING" },
    description: { type: "STRING", maxLength: "300" },
  },
  required: ["name", "type", "description"],
};

const beverageSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    description: { type: "STRING", maxLength: "300" },
  },
  required: ["name", "description"],
};

const mealCostTierSchema = {
  type: "OBJECT",
  properties: {
    budget: { type: "NUMBER" },
    midRange: { type: "NUMBER" },
  },
  required: ["budget", "midRange"],
};

export const foodSchema = {
  type: "OBJECT",
  properties: {
    dishes: { type: "ARRAY", items: dishSchema },
    beverages: { type: "ARRAY", items: beverageSchema },
    mealCostEstimate: {
      type: "OBJECT",
      properties: {
        breakfast: mealCostTierSchema,
        lunch: mealCostTierSchema,
        dinner: mealCostTierSchema,
        currency: { type: "STRING" },
        notes: { type: "STRING", maxLength: "300" },
      },
      required: ["breakfast", "lunch", "dinner", "currency", "notes"],
    },
  },
  required: ["dishes", "beverages", "mealCostEstimate"],
};

export const shoppingItemSchema = {
  type: "OBJECT",
  properties: {
    item: { type: "STRING" },
    description: { type: "STRING", maxLength: "300" },
    whereToBuy: { type: "STRING" },
    priceRange: { type: "STRING" },
  },
  required: ["item", "description", "whereToBuy", "priceRange"],
};

export const bewareOfItemSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", maxLength: "60" },
    description: { type: "STRING", maxLength: "300" },
  },
  required: ["title", "description"],
};

export const emergencyInfoSchema = {
  type: "OBJECT",
  properties: {
    generalEmergencyNumber: { type: "STRING", maxLength: "60" },
    embassyNote: { type: "STRING", maxLength: "400" },
  },
  required: ["generalEmergencyNumber", "embassyNote"],
};

// Deliberately NOT part of TRIP_PLAN_SCHEMA/the main generation call — the
// main schema has already grown to 11 required top-level sections and has
// been hitting Gemini's repetition-loop/incomplete-response bug at a high
// failure rate. This is a separate, smaller follow-up call (see
// getTripExtras in tripAI.js) so a failure here never blocks the trip
// itself from generating; it just means these extras are missing.
export const tripExtrasSchema = {
  type: "OBJECT",
  properties: {
    visaInfo: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", maxLength: "60" },
        note: { type: "STRING", maxLength: "300" },
      },
      required: ["status", "note"],
    },
    simInfo: {
      type: "OBJECT",
      properties: {
        recommendation: { type: "STRING", maxLength: "60" },
        note: { type: "STRING", maxLength: "300" },
      },
      required: ["recommendation", "note"],
    },
    phrasebook: {
      type: "ARRAY",
      minItems: "4",
      maxItems: "6",
      items: {
        type: "OBJECT",
        properties: {
          phrase: { type: "STRING", maxLength: "40" },
          translation: { type: "STRING", maxLength: "60" },
          pronunciation: { type: "STRING", maxLength: "60" },
        },
        required: ["phrase", "translation", "pronunciation"],
      },
    },
    bookInAdvance: {
      type: "ARRAY",
      minItems: "2",
      maxItems: "4",
      items: { type: "STRING", maxLength: "150" },
    },
    attractionPhotoTips: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", maxLength: "80" },
          tip: { type: "STRING", maxLength: "150" },
        },
        required: ["name", "tip"],
      },
    },
  },
  required: ["visaInfo", "simInfo", "phrasebook", "bookInAdvance", "attractionPhotoTips"],
};

const currencyInfoSchema = {
  type: "OBJECT",
  properties: {
    isForeign: { type: "BOOLEAN" },
    // Not actually nullable/optional even though the prompt's prose rule
    // says these can be omitted when isForeign is false — Gemini's schema
    // can't express "required only if isForeign is true", and making them
    // nullable gave the model explicit license to skip localCurrencyCode
    // even when isForeign WAS true, which it did (confirmed live: "1
    // undefined = 2.44 INR"). Safe to force these always-present: when
    // isForeign is false, CurrencyInfo.jsx never renders this section at
    // all, so whatever trivial value the model gives them is never shown.
    localCurrencyName: { type: "STRING", maxLength: "60" },
    localCurrencyCode: { type: "STRING", maxLength: "10" },
    oneUnitOfInputCurrencyInLocal: { type: "NUMBER" },
    exchangeRateNote: { type: "STRING", nullable: true, maxLength: "60" },
    recommendation: {
      type: "STRING",
      format: "enum",
      enum: ["carry-cash", "get-local-currency", "card-friendly"],
      nullable: true,
    },
    // recommendationReason is where a Gemini repetition-loop bug blew up to
    // 73,000+ characters in production (12,425x "Bye!" followed by unrelated
    // hallucinated text), eating the whole token budget and truncating the
    // rest of the JSON. maxLength is enforced during constrained decoding
    // (not just post-hoc validation), so this caps the runaway at the root.
    recommendationReason: { type: "STRING", nullable: true, maxLength: "500" },
    airportExchangeWarning: { type: "STRING", nullable: true, maxLength: "300" },
    betterExchangeOptions: {
      type: "ARRAY",
      items: { type: "STRING", maxLength: "150" },
      nullable: true,
    },
    cardTips: { type: "STRING", nullable: true, maxLength: "300" },
  },
  required: [
    "isForeign",
    "localCurrencyName",
    "localCurrencyCode",
    "oneUnitOfInputCurrencyInLocal",
  ],
};

const budgetBreakdownLineSchema = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING" },
    amount: { type: "NUMBER" },
    percentage: { type: "NUMBER" },
  },
  required: ["category", "amount", "percentage"],
};

const plannerSchema = {
  type: "OBJECT",
  properties: {
    budgetBreakdown: { type: "ARRAY", items: budgetBreakdownLineSchema },
    tips: { type: "ARRAY", items: { type: "STRING", maxLength: "250" } },
    totalEstimate: { type: "NUMBER" },
  },
  required: ["budgetBreakdown", "tips", "totalEstimate"],
};

export const weatherSchema = {
  type: "OBJECT",
  properties: {
    months: { type: "ARRAY", items: weatherMonthSchema, minItems: "12", maxItems: "12" },
    bestMonthsSummary: { type: "STRING", maxLength: "300" },
    avoidMonthsSummary: { type: "STRING", nullable: true, maxLength: "300" },
  },
  required: ["months", "bestMonthsSummary"],
};

export const packingListSchema = {
  type: "OBJECT",
  properties: {
    clothing: { type: "ARRAY", items: { type: "STRING", maxLength: "100" } },
    documents: { type: "ARRAY", items: { type: "STRING", maxLength: "100" } },
    electronics: { type: "ARRAY", items: { type: "STRING", maxLength: "100" } },
    toiletries: { type: "ARRAY", items: { type: "STRING", maxLength: "100" } },
    misc: { type: "ARRAY", items: { type: "STRING", maxLength: "100" } },
  },
  required: ["clothing", "documents", "electronics", "toiletries", "misc"],
};

export const TRIP_PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    weather: weatherSchema,
    itinerary: { type: "ARRAY", items: itineraryDaySchema },
    packingList: packingListSchema,
    planner: plannerSchema,
    attractions: { type: "ARRAY", items: attractionSchema },
    flights: flightsSchema,
    food: foodSchema,
    shopping: { type: "ARRAY", items: shoppingItemSchema },
    currencyInfo: currencyInfoSchema,
    bewareOf: { type: "ARRAY", items: bewareOfItemSchema, minItems: "3", maxItems: "6" },
    emergencyInfo: emergencyInfoSchema,
  },
  required: [
    "weather",
    "itinerary",
    "packingList",
    "planner",
    "attractions",
    "food",
    "shopping",
    "currencyInfo",
    "bewareOf",
    "emergencyInfo",
  ],
};

// Used for multi-destination trips (2+ stops) instead of TRIP_PLAN_SCHEMA —
// one call per stop, requesting only the content that's genuinely scoped to
// THAT destination (its own climate, attractions, food, currency, safety
// notes). Deliberately everything TRIP_PLAN_SCHEMA has EXCEPT itinerary,
// planner, flights, and packingList — those are cross-cutting across the
// whole trip and live in ITINERARY_AND_BUDGET_SCHEMA below instead. Keeping
// this call's section count below today's single-destination call (7 vs
// 10-11) is deliberate: the existing call already sits right at the edge of
// Gemini's repetition-loop/truncation failure mode at its current size, so
// this must not grow past it just because there are now multiple stops.
export const PER_DESTINATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    weather: weatherSchema,
    attractions: { type: "ARRAY", items: attractionSchema },
    food: foodSchema,
    shopping: { type: "ARRAY", items: shoppingItemSchema },
    currencyInfo: currencyInfoSchema,
    bewareOf: { type: "ARRAY", items: bewareOfItemSchema, minItems: "3", maxItems: "6" },
    emergencyInfo: emergencyInfoSchema,
  },
  required: [
    "weather",
    "attractions",
    "food",
    "shopping",
    "currencyInfo",
    "bewareOf",
    "emergencyInfo",
  ],
};

// Used for multi-destination trips (2+ stops) — the ONE cross-cutting call
// covering everything that spans the whole trip rather than a single stop:
// the day-by-day itinerary (each day tagged with which stop it's in), the
// overall budget breakdown, the open-jaw flights in/out, the inter-city legs
// between stops, and a single trip-wide packing list (a traveler packs once
// before leaving home, regardless of how many stops the trip has).
export const ITINERARY_AND_BUDGET_SCHEMA = {
  type: "OBJECT",
  properties: {
    itinerary: { type: "ARRAY", items: itineraryDaySchema },
    planner: plannerSchema,
    flights: flightsSchema,
    packingList: packingListSchema,
    interCityLegs: { type: "ARRAY", items: interCityLegSchema },
  },
  required: ["itinerary", "planner", "packingList", "interCityLegs"],
};
