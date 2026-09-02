import { generateCompletion, MODEL_SMALL } from "./gemini";

// Keeps the flattened transcript sent as the prompt bounded — a long back-
// and-forth would otherwise grow the prompt (and token cost) on every
// single turn. Last 8 messages is ~4 exchanges, plenty for a Q&A widget
// where each question is usually independent anyway.
const MAX_HISTORY_MESSAGES = 8;

/**
 * Condenses a trip into a compact plain-text summary for the chat
 * assistant's context. The raw trip object carries large image URLs/credit
 * metadata that add nothing to answering questions and would just inflate
 * the prompt, so this pulls out only the content a traveler might actually
 * ask about.
 */
function buildTripContext(trip) {
  const {
    input, itinerary, packingList, planner, attractions,
    flights, food, shopping, currencyInfo, bewareOf,
  } = trip;

  const lines = [];
  lines.push(`Destination: ${input?.destination}`);
  lines.push(
    `${input?.days} days, ${input?.pax} traveler(s), ${input?.tripType || "general"} trip, departing from ${input?.departureCity || "unspecified"}.`
  );
  lines.push(
    `Total budget: ${input?.budget} ${input?.currency}${input?.flightsIncluded ? " (flights included)" : " (flights excluded)"}.`
  );

  if (planner?.budgetBreakdown?.length) {
    lines.push(
      "Budget breakdown: " +
        planner.budgetBreakdown
          .map((b) => `${b.category} ${b.amount} ${input?.currency}`)
          .join(", ")
    );
  }
  if (planner?.tips?.length) {
    lines.push("Budget tips: " + planner.tips.join(" | "));
  }

  if (flights) {
    lines.push(
      `Flights: ${flights.departureCity} -> ${flights.destination}. Outbound approx ${flights.outbound?.priceRangeLow}-${flights.outbound?.priceRangeHigh} ${input?.currency}/person, return approx ${flights.returnFlight?.priceRangeLow}-${flights.returnFlight?.priceRangeHigh} ${input?.currency}/person. ${flights.bookingTip || ""}`
    );
  }

  if (itinerary?.length) {
    lines.push("Itinerary:");
    itinerary.forEach((day) => {
      lines.push(`Day ${day.day}: ${day.title}`);
      (day.activities || []).forEach((act) => {
        lines.push(`  - ${act.time}: ${act.activity}${act.notes ? ` (${act.notes})` : ""}`);
      });
    });
  }

  if (attractions?.length) {
    lines.push(
      "Attractions: " +
        attractions.map((a) => `${a.name} (${a.category}) - ${a.description}`).join(" | ")
    );
  }

  if (food) {
    lines.push(
      "Local dishes: " + (food.dishes || []).map((d) => d.name).join(", ")
    );
    if (food.mealCostEstimate) {
      const m = food.mealCostEstimate;
      lines.push(
        `Meal costs per person (budget/mid-range): breakfast ${m.breakfast?.budget}/${m.breakfast?.midRange}, lunch ${m.lunch?.budget}/${m.lunch?.midRange}, dinner ${m.dinner?.budget}/${m.dinner?.midRange} ${m.currency}. ${m.notes || ""}`
      );
    }
  }

  if (shopping?.length) {
    lines.push(
      "Shopping: " + shopping.map((s) => `${s.item} (${s.priceRange})`).join(", ")
    );
  }

  if (packingList) {
    const allItems = [
      ...(packingList.clothing || []),
      ...(packingList.documents || []),
      ...(packingList.electronics || []),
      ...(packingList.toiletries || []),
      ...(packingList.misc || []),
    ];
    if (allItems.length) lines.push("Packing list: " + allItems.join(", "));
  }

  if (currencyInfo?.isForeign) {
    lines.push(
      `Currency: local currency is ${currencyInfo.localCurrencyName} (${currencyInfo.localCurrencyCode}), approx 1 ${input?.currency} = ${currencyInfo.oneUnitOfInputCurrencyInLocal} ${currencyInfo.localCurrencyCode}. Recommendation: ${currencyInfo.recommendation}. ${currencyInfo.recommendationReason || ""}`
    );
  }

  if (bewareOf?.length) {
    lines.push(
      "Things to watch out for: " +
        bewareOf.map((b) => `${b.title} - ${b.description}`).join(" | ")
    );
  }

  return lines.join("\n");
}

/**
 * Answers a question about a specific generated trip, grounded in that
 * trip's actual content. `history` is the full conversation so far
 * (including the just-asked question as the last entry) as
 * {role: "user"|"assistant", content}[] — flattened into a single prompt
 * since generateCompletion is a plain single-turn completion call, not a
 * chat-turns API.
 *
 * Uses MODEL_SMALL (the app's cheap/fast tier) deliberately: this is
 * conversational Q&A, not the large structured-JSON generation the main
 * plan needs, and it draws from a separate, independent daily quota —
 * keeping chat traffic off the same tight pool as full trip generation.
 *
 * @param {Object} trip
 * @param {Array<{role: "user"|"assistant", content: string}>} history
 * @param {(text: string) => void} [onChunk] - streamed partial-answer callback
 * @returns {Promise<string>} the assistant's answer
 */
export async function askTripQuestion(trip, history, onChunk) {
  const context = buildTripContext(trip);
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  const transcript =
    recent.map((m) => `${m.role === "user" ? "Traveler" : "Assistant"}: ${m.content}`).join("\n") +
    "\nAssistant:";

  const system = `You are AbhiTrip's trip assistant. You help the traveler with questions about THEIR SPECIFIC trip plan below — budget, itinerary, packing, food, currency, safety, or anything else in it. Answer conversationally and concisely (2-4 sentences unless the question genuinely needs more detail), grounded in the actual plan details given below rather than generic travel advice. If asked something with no connection to this trip or trip planning, politely say that's outside what you can help with here. Never invent specific prices/places not implied by the plan below — say so plainly if something isn't covered by it instead.

TRIP PLAN:
${context}`;

  return generateCompletion({
    system,
    prompt: transcript,
    temperature: 0.6,
    maxTokens: 800,
    model: MODEL_SMALL,
    thinkingLevel: "MINIMAL",
    onChunk,
  });
}
