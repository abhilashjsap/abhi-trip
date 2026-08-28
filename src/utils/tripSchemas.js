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
    conditions: { type: "STRING" },
    rating: {
      type: "STRING",
      format: "enum",
      enum: ["best", "good", "okay", "avoid"],
    },
    bestFor: { type: "STRING", nullable: true },
  },
  required: ["month", "avgHighC", "avgLowC", "conditions", "rating"],
};

const activitySchema = {
  type: "OBJECT",
  properties: {
    time: { type: "STRING" },
    activity: { type: "STRING" },
    notes: { type: "STRING", nullable: true },
  },
  required: ["time", "activity"],
};

export const itineraryDaySchema = {
  type: "OBJECT",
  properties: {
    day: { type: "INTEGER" },
    title: { type: "STRING" },
    activities: { type: "ARRAY", items: activitySchema },
  },
  required: ["day", "title", "activities"],
};

export const attractionSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    category: { type: "STRING" },
    description: { type: "STRING" },
    historicalSignificance: { type: "STRING", nullable: true },
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
    notes: { type: "STRING" },
  },
  required: ["priceRangeLow", "priceRangeHigh", "typicalAirlines", "notes"],
};

const flightsSchema = {
  type: "OBJECT",
  nullable: true,
  properties: {
    departureCity: { type: "STRING" },
    destination: { type: "STRING" },
    outbound: flightLegSchema,
    returnFlight: flightLegSchema,
    bookingTip: { type: "STRING" },
  },
  required: ["departureCity", "destination", "outbound", "returnFlight", "bookingTip"],
};

const dishSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    type: { type: "STRING" },
    description: { type: "STRING" },
  },
  required: ["name", "type", "description"],
};

const beverageSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    description: { type: "STRING" },
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
        notes: { type: "STRING" },
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
    description: { type: "STRING" },
    whereToBuy: { type: "STRING" },
    priceRange: { type: "STRING" },
  },
  required: ["item", "description", "whereToBuy", "priceRange"],
};

export const currencyInfoSchema = {
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
    localCurrencyName: { type: "STRING" },
    localCurrencyCode: { type: "STRING" },
    oneUnitOfInputCurrencyInLocal: { type: "NUMBER" },
    exchangeRateNote: { type: "STRING", nullable: true },
    recommendation: {
      type: "STRING",
      format: "enum",
      enum: ["carry-cash", "get-local-currency", "card-friendly"],
      nullable: true,
    },
    recommendationReason: { type: "STRING", nullable: true },
    airportExchangeWarning: { type: "STRING", nullable: true },
    betterExchangeOptions: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
    cardTips: { type: "STRING", nullable: true },
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

export const plannerSchema = {
  type: "OBJECT",
  properties: {
    budgetBreakdown: { type: "ARRAY", items: budgetBreakdownLineSchema },
    tips: { type: "ARRAY", items: { type: "STRING" } },
    totalEstimate: { type: "NUMBER" },
  },
  required: ["budgetBreakdown", "tips", "totalEstimate"],
};

export const weatherSchema = {
  type: "OBJECT",
  properties: {
    months: { type: "ARRAY", items: weatherMonthSchema, minItems: "12", maxItems: "12" },
    bestMonthsSummary: { type: "STRING" },
    avoidMonthsSummary: { type: "STRING", nullable: true },
  },
  required: ["months", "bestMonthsSummary"],
};

export const packingListSchema = {
  type: "OBJECT",
  properties: {
    clothing: { type: "ARRAY", items: { type: "STRING" } },
    documents: { type: "ARRAY", items: { type: "STRING" } },
    electronics: { type: "ARRAY", items: { type: "STRING" } },
    toiletries: { type: "ARRAY", items: { type: "STRING" } },
    misc: { type: "ARRAY", items: { type: "STRING" } },
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
  ],
};
