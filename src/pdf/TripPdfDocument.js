import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// Written with React.createElement instead of JSX — this file runs inside
// a Vercel Node function (api/pdf.js), and Vercel's docs don't explicitly
// confirm JSX gets transpiled for arbitrary /api files the way it does for
// .ts. Rather than gamble on that (a wrong guess here silently breaks
// every PDF export in production), this avoids the question entirely: no
// JSX means no dependency on any particular build-time transform existing.
const h = React.createElement;

// Brand colors, matching src/App.css's :root custom properties.
const COLORS = {
  navy: "#1B2430",
  sand: "#E8DCC8",
  paper: "#F7F4EE",
  rust: "#B8543A",
  sage: "#7A8C7E",
  ink: "#242018",
  inkSoft: "#5A5548",
  line: "#D9D4C8",
};

// Deliberately using react-pdf's built-in standard fonts (no Font.register)
// rather than fetching Fraunces/Inter from Google Fonts. React-pdf can only
// parse TTF/WOFF, and Google's CSS API only serves those to a spoofed
// legacy User-Agent — a fragile hack where a silent font-fetch failure
// would break every PDF export. Times-Bold/Helvetica are always available,
// zero network dependency, and close enough to the web app's serif-heading
// + sans-body pairing.
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.ink,
    backgroundColor: "#FFFFFF",
  },
  destinationTitle: {
    fontFamily: "Times-Bold",
    fontSize: 26,
    color: COLORS.navy,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 11,
    color: COLORS.inkSoft,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `1pt solid ${COLORS.line}`,
  },
  metaItem: {
    minWidth: 90,
  },
  metaLabel: {
    fontSize: 8,
    color: COLORS.rust,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  section: {
    marginBottom: 22,
  },
  sectionEyebrow: {
    fontSize: 8,
    color: COLORS.rust,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  sectionTitle: {
    fontFamily: "Times-Bold",
    fontSize: 16,
    color: COLORS.navy,
    marginBottom: 10,
  },
  card: {
    border: `1pt solid ${COLORS.line}`,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    breakInside: "avoid",
  },
  cardTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 3,
  },
  cardMeta: {
    fontSize: 8,
    color: COLORS.inkSoft,
    marginTop: 4,
  },
  bodyText: {
    fontSize: 9.5,
    lineHeight: 1.4,
    color: COLORS.ink,
  },
  mutedText: {
    fontSize: 9,
    lineHeight: 1.4,
    color: COLORS.inkSoft,
  },
  row: {
    flexDirection: "row",
  },
  attractionRow: {
    flexDirection: "row",
    gap: 10,
  },
  attractionImage: {
    width: 70,
    height: 70,
    borderRadius: 4,
    objectFit: "cover",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  dayNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.rust,
    color: "#FFFFFF",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 5,
  },
  dayTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
  },
  activityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 5,
    paddingLeft: 30,
  },
  activityTime: {
    width: 60,
    fontSize: 8,
    color: COLORS.rust,
    textTransform: "uppercase",
  },
  weatherTable: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  weatherCell: {
    width: "25%",
    padding: 6,
    borderBottom: `1pt solid ${COLORS.line}`,
    borderRight: `1pt solid ${COLORS.line}`,
  },
  weatherMonth: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  weatherTemp: {
    fontSize: 9,
    color: COLORS.inkSoft,
  },
  weatherRating: {
    fontSize: 7,
    textTransform: "uppercase",
    marginTop: 2,
  },
  budgetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottom: `1pt solid ${COLORS.line}`,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 6,
    borderTop: `1.5pt solid ${COLORS.navy}`,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: COLORS.inkSoft,
    textAlign: "center",
  },
});

const RATING_LABELS = { best: "Best", good: "Good", okay: "Okay", avoid: "Avoid" };
const RATING_COLORS = {
  best: COLORS.sage,
  good: COLORS.rust,
  okay: COLORS.inkSoft,
  avoid: COLORS.inkSoft,
};

function money(amount, currency) {
  if (amount == null) return "";
  return `${currency} ${Number(amount).toLocaleString()}`;
}

function Section(key, eyebrow, title, children) {
  return h(View, { key, style: styles.section }, [
    h(Text, { style: styles.sectionEyebrow, key: "eyebrow" }, eyebrow),
    h(Text, { style: styles.sectionTitle, key: "title" }, title),
    ...children,
  ]);
}

function AttractionsSection(attractions) {
  if (!attractions?.length) return null;
  return Section(
    "attractions",
    "Where to go",
    "Places worth your time",
    attractions.map((place, idx) =>
      h(View, { key: idx, style: styles.card, wrap: false }, [
        h(View, { key: "row", style: styles.attractionRow }, [
          place.image?.url &&
            h(Image, { key: "img", src: place.image.url, style: styles.attractionImage }),
          h(View, { key: "body", style: { flex: 1 } }, [
            h(
              Text,
              { key: "title", style: styles.cardTitle },
              `${place.name} — ${place.category}`
            ),
            h(Text, { key: "desc", style: styles.bodyText }, place.description),
            place.historicalSignificance &&
              h(
                Text,
                { key: "hist", style: styles.mutedText },
                place.historicalSignificance
              ),
            place.photoTip &&
              h(Text, { key: "photoTip", style: styles.mutedText }, `Photo tip: ${place.photoTip}`),
            h(
              Text,
              { key: "meta", style: styles.cardMeta },
              [place.bestTimeToVisit, place.estimatedDuration].filter(Boolean).join(" · ")
            ),
          ]),
        ]),
      ])
    )
  );
}

function WeatherSection(weather) {
  if (!weather?.months?.length) return null;
  return Section("weather", "When to go", "Weather by month", [
    weather.bestMonthsSummary &&
      h(
        Text,
        { key: "summary", style: [styles.bodyText, { marginBottom: 8 }] },
        weather.bestMonthsSummary
      ),
    h(
      View,
      { key: "table", style: styles.weatherTable, wrap: false },
      weather.months.map((m) =>
        h(View, { key: m.month, style: styles.weatherCell }, [
          h(Text, { key: "m", style: styles.weatherMonth }, m.month.slice(0, 3)),
          h(Text, { key: "t", style: styles.weatherTemp }, `${m.avgHighC}° / ${m.avgLowC}°`),
          h(
            Text,
            {
              key: "r",
              style: [styles.weatherRating, { color: RATING_COLORS[m.rating] || COLORS.inkSoft }],
            },
            RATING_LABELS[m.rating] || m.rating
          ),
        ])
      )
    ),
  ]);
}

function ItinerarySection(itinerary) {
  if (!itinerary?.length) return null;
  return Section(
    "itinerary",
    "The plan",
    "Day by day",
    itinerary.map((day) =>
      h(View, { key: day.day, style: styles.card, wrap: false }, [
        h(View, { key: "header", style: styles.dayHeader }, [
          h(
            Text,
            { key: "num", style: styles.dayNumber },
            String(day.day).padStart(2, "0")
          ),
          h(Text, { key: "title", style: styles.dayTitle }, day.title),
        ]),
        ...(day.activities || []).map((act, idx) =>
          h(View, { key: idx, style: styles.activityRow }, [
            h(Text, { key: "time", style: styles.activityTime }, act.time),
            h(
              Text,
              { key: "act", style: [styles.bodyText, { flex: 1 }] },
              act.activity + (act.notes ? `  —  ${act.notes}` : "")
            ),
          ])
        ),
      ])
    )
  );
}

function FlightsSection(flights, currency) {
  if (!flights) return null;
  return Section("flights", "Getting there", "Flight estimates", [
    h(
      Text,
      { key: "route", style: [styles.bodyText, { marginBottom: 6 }] },
      `${flights.departureCity}  to  ${flights.destination}`
    ),
    h(View, { key: "legs", style: styles.row }, [
      h(View, { key: "out", style: { flex: 1 } }, [
        h(Text, { key: "t", style: styles.cardTitle }, "Outbound"),
        h(
          Text,
          { key: "p", style: styles.bodyText },
          `${money(flights.outbound?.priceRangeLow, currency)} – ${money(flights.outbound?.priceRangeHigh, currency)}`
        ),
        h(
          Text,
          { key: "a", style: styles.mutedText },
          (flights.outbound?.typicalAirlines || []).join(", ")
        ),
      ]),
      h(View, { key: "ret", style: { flex: 1 } }, [
        h(Text, { key: "t", style: styles.cardTitle }, "Return"),
        h(
          Text,
          { key: "p", style: styles.bodyText },
          `${money(flights.returnFlight?.priceRangeLow, currency)} – ${money(flights.returnFlight?.priceRangeHigh, currency)}`
        ),
        h(
          Text,
          { key: "a", style: styles.mutedText },
          (flights.returnFlight?.typicalAirlines || []).join(", ")
        ),
      ]),
    ]),
    flights.bookingTip &&
      h(Text, { key: "tip", style: [styles.mutedText, { marginTop: 6 }] }, flights.bookingTip),
  ]);
}

function CurrencySection(currencyInfo, currency) {
  if (!currencyInfo?.isForeign) return null;
  return Section("currency", "Money matters", "Currency & exchange", [
    h(
      Text,
      { key: "rate", style: [styles.bodyText, { marginBottom: 4 }] },
      `${currencyInfo.localCurrencyName} (${currencyInfo.localCurrencyCode})` +
        (currencyInfo.oneUnitOfInputCurrencyInLocal
          ? ` — 1 ${currency} approx. ${currencyInfo.oneUnitOfInputCurrencyInLocal} ${currencyInfo.localCurrencyCode}`
          : "")
    ),
    currencyInfo.recommendationReason &&
      h(Text, { key: "reason", style: styles.mutedText }, currencyInfo.recommendationReason),
    currencyInfo.airportExchangeWarning &&
      h(
        Text,
        { key: "warn", style: [styles.mutedText, { marginTop: 4 }] },
        currencyInfo.airportExchangeWarning
      ),
    currencyInfo.cardTips &&
      h(Text, { key: "card", style: [styles.mutedText, { marginTop: 4 }] }, currencyInfo.cardTips),
  ]);
}

function BewareOfSection(bewareOf) {
  if (!bewareOf?.length) return null;
  return Section(
    "bewareOf",
    "Stay sharp",
    "Beware of",
    bewareOf.map((item, idx) =>
      h(Text, { key: idx, style: [styles.bodyText, { marginBottom: 4 }] }, [
        h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, item.title),
        ` — ${item.description}`,
      ])
    )
  );
}

function EmergencyInfoSection(emergencyInfo) {
  if (!emergencyInfo?.generalEmergencyNumber) return null;
  return Section("emergencyInfo", "Just in case", "Emergency info", [
    h(Text, { key: "num", style: [styles.bodyText, { marginBottom: 4 }] }, [
      h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, "Emergency number: "),
      emergencyInfo.generalEmergencyNumber,
    ]),
    emergencyInfo.embassyNote &&
      h(Text, { key: "embassy", style: styles.mutedText }, emergencyInfo.embassyNote),
  ]);
}

function PracticalInfoSection(visaInfo, simInfo, bookInAdvance) {
  if (!visaInfo && !simInfo) return null;
  return Section("practicalInfo", "Before you go", "Practical info", [
    visaInfo &&
      h(Text, { key: "visa", style: [styles.bodyText, { marginBottom: 6 }] }, [
        h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, `Visa: ${visaInfo.status} — `),
        visaInfo.note,
      ]),
    simInfo &&
      h(Text, { key: "sim", style: [styles.bodyText, { marginBottom: 6 }] }, [
        h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, `SIM: ${simInfo.recommendation} — `),
        simInfo.note,
      ]),
    bookInAdvance?.length > 0 &&
      h(Text, { key: "book", style: styles.mutedText }, [
        h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, "Book in advance: "),
        bookInAdvance.join("; "),
      ]),
  ]);
}

function PhrasebookSection(phrasebook) {
  if (!phrasebook?.length) return null;
  return Section(
    "phrasebook",
    "Speak a little local",
    "Useful phrases",
    phrasebook.map((entry, idx) =>
      h(Text, { key: idx, style: [styles.bodyText, { marginBottom: 4 }] }, [
        h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, `${entry.phrase}: `),
        `${entry.translation} (${entry.pronunciation})`,
      ])
    )
  );
}

function FoodSection(food) {
  if (!food) return null;
  return Section("food", "Eat & drink", "Local food to try", [
    ...(food.dishes || []).map((dish, idx) =>
      h(Text, { key: idx, style: [styles.bodyText, { marginBottom: 4 }] }, [
        h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, dish.name),
        `  (${dish.type}) — ${dish.description}`,
      ])
    ),
    food.beverages?.length > 0 &&
      h(
        Text,
        { key: "bev", style: [styles.mutedText, { marginTop: 6 }] },
        `Drinks: ${food.beverages.map((b) => b.name).join(", ")}`
      ),
  ]);
}

function ShoppingSection(shopping) {
  if (!shopping?.length) return null;
  return Section(
    "shopping",
    "Take home",
    "What to buy",
    shopping.map((item, idx) =>
      h(Text, { key: idx, style: [styles.bodyText, { marginBottom: 4 }] }, [
        h(Text, { key: "n", style: { fontFamily: "Helvetica-Bold" } }, item.item),
        `${item.priceRange ? ` (${item.priceRange})` : ""} — ${item.description}`,
      ])
    )
  );
}

function PackingListSection(packingList) {
  if (!packingList) return null;
  const entries = Object.entries(packingList).filter(([, items]) => items?.length);
  if (!entries.length) return null;
  return Section("packing", "Before you go", "Packing list", [
    h(
      View,
      { key: "grid", style: { flexDirection: "row", flexWrap: "wrap", gap: 16 } },
      entries.map(([category, items]) =>
        h(View, { key: category, style: { minWidth: 140 }, wrap: false }, [
          h(
            Text,
            { key: "cat", style: [styles.cardTitle, { textTransform: "capitalize" }] },
            category
          ),
          ...items.map((item, idx) => h(Text, { key: idx, style: styles.bodyText }, `• ${item}`)),
        ])
      )
    ),
  ]);
}

function PlannerSection(planner, currency) {
  if (!planner) return null;
  return Section("planner", "The numbers", "Budget breakdown", [
    ...(planner.budgetBreakdown || []).map((line, idx) =>
      h(View, { key: idx, style: styles.budgetRow }, [
        h(Text, { key: "c", style: styles.bodyText }, line.category),
        h(Text, { key: "a", style: styles.bodyText }, money(line.amount, currency)),
      ])
    ),
    h(View, { key: "total", style: styles.totalRow }, [
      h(Text, { key: "l", style: { fontFamily: "Helvetica-Bold" } }, "Total estimate"),
      h(
        Text,
        { key: "v", style: { fontFamily: "Helvetica-Bold" } },
        money(planner.totalEstimate, currency)
      ),
    ]),
    planner.tips?.length > 0 &&
      h(
        View,
        { key: "tips", style: { marginTop: 10 } },
        planner.tips.map((tip, idx) =>
          h(Text, { key: idx, style: [styles.mutedText, { marginBottom: 3 }] }, `— ${tip}`)
        )
      ),
  ]);
}

export default function TripPdfDocument({ trip }) {
  const {
    input,
    weather,
    itinerary,
    packingList,
    planner,
    attractions,
    flights,
    food,
    shopping,
    currencyInfo,
    bewareOf,
    emergencyInfo,
    visaInfo,
    simInfo,
    phrasebook,
    bookInAdvance,
  } = trip;

  const currency = input?.currency;

  const metaRow = h(View, { key: "meta", style: styles.metaRow }, [
    h(View, { key: "days", style: styles.metaItem }, [
      h(Text, { key: "l", style: styles.metaLabel }, "Duration"),
      h(Text, { key: "v", style: styles.metaValue }, `${input?.days} days`),
    ]),
    h(View, { key: "pax", style: styles.metaItem }, [
      h(Text, { key: "l", style: styles.metaLabel }, "Travelers"),
      h(Text, { key: "v", style: styles.metaValue }, String(input?.pax)),
    ]),
    h(View, { key: "budget", style: styles.metaItem }, [
      h(Text, { key: "l", style: styles.metaLabel }, "Budget"),
      h(Text, { key: "v", style: styles.metaValue }, money(input?.budget, currency)),
    ]),
    h(View, { key: "flights", style: styles.metaItem }, [
      h(Text, { key: "l", style: styles.metaLabel }, "Flights"),
      h(
        Text,
        { key: "v", style: styles.metaValue },
        input?.flightsIncluded ? "Included" : "Arranged separately"
      ),
    ]),
  ]);

  const footer = h(Text, {
    key: "footer",
    style: styles.footer,
    render: ({ pageNumber, totalPages }) => `AbhiTrip · Page ${pageNumber} of ${totalPages}`,
    fixed: true,
  });

  // Each XSection() call returns a fully-keyed element (see Section()
  // above) or null when that part of the trip has no data — React ignores
  // null children with no key required, so this array can go straight into
  // Page's children with no further wrapping.
  return h(
    Document,
    { title: `AbhiTrip - ${input?.destination || "Trip"}` },
    h(Page, { size: "A4", style: styles.page, wrap: true }, [
      h(Text, { key: "title", style: styles.destinationTitle }, input?.destination),
      h(
        Text,
        { key: "tagline", style: styles.tagline },
        `${input?.days} days of plans, packed and mapped out.`
      ),
      metaRow,
      AttractionsSection(attractions),
      WeatherSection(weather),
      ItinerarySection(itinerary),
      FlightsSection(flights, currency),
      CurrencySection(currencyInfo, currency),
      BewareOfSection(bewareOf),
      EmergencyInfoSection(emergencyInfo),
      PracticalInfoSection(visaInfo, simInfo, bookInAdvance),
      PhrasebookSection(phrasebook),
      FoodSection(food),
      ShoppingSection(shopping),
      PackingListSection(packingList),
      PlannerSection(planner, currency),
      footer,
    ])
  );
}
