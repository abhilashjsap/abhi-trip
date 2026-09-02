# AbhiTrip

A single-user, password-gated AI trip planner. Fill in a destination, budget,
headcount, and trip length — Gemini generates a full trip dossier: itinerary,
budget breakdown, attractions with photos and a map, weather (historical +
live forecast), currency/exchange info, local food, packing list, a "beware
of" safety section, and a chat widget to ask follow-up questions about the
plan. Trips can be exported to PDF or shared via a read-only link.

This is a personal hobby project, not a multi-tenant product — there's one
shared password, no accounts, and everything is built to run on free tiers.

## Tech stack

- **Frontend:** React 18 + Vite 7 (SPA, no router)
- **AI:** Google Gemini via `@google/genai`, called through a Vercel
  serverless proxy (keeps the API key server-side and works around Gemini's
  lack of CORS support for direct browser calls)
- **PDF export:** `@react-pdf/renderer`, rendered server-side from the trip's
  actual data (not a screenshot of the page)
- **Map:** `leaflet` / `react-leaflet` over OpenStreetMap tiles
- **Sharing:** `@upstash/redis` (free tier) for shareable trip links
- **Hosting:** Vercel — the SPA is served as static assets, and `api/*.js`
  files are picked up automatically as serverless functions

Other free, keyless APIs used directly from the browser: OpenStreetMap
Nominatim (destination/attraction geocoding), Open-Meteo (live weather
forecast), Frankfurter (live FX rates), and Unsplash (destination/attraction
photos, client-side key).

## Getting started

```bash
npm install
npm run dev
```

The dev server only runs the frontend — the `api/` serverless functions
don't execute under plain `vite dev`, so anything that calls Gemini,
exports a PDF, or creates/loads a share link only works against the real
Vercel deployment, not local dev.

### Environment variables

Set these in the Vercel project's environment variables (there's no local
`.env` checked in, and none is required for `npm run dev` unless you want
photos in local dev, in which case `VITE_UNSPLASH_ACCESS_KEY` is enough).

| Variable | Where it's read | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Server (`api/gemini.js`) | Gemini API key. Never bundled into client JS. |
| `UPSTASH_REDIS_REST_URL` | Server (`api/share.js`) | Upstash REST endpoint for the share-link store. |
| `UPSTASH_REDIS_REST_TOKEN` | Server (`api/share.js`) | Upstash REST auth token. |
| `VITE_APP_PASSWORD` | Client (bundled) | The password gate. Visible in the built JS — a light deterrent, not real access control. |
| `VITE_UNSPLASH_ACCESS_KEY` | Client (bundled) | Unsplash's own model is a client-exposed key; missing it just disables photos. |

`VITE_`-prefixed variables are baked into the build at compile time, so
changing one in Vercel's dashboard requires a redeploy to take effect —
saving the new value alone doesn't touch the already-built JS.

## Project structure

```
src/
  components/   One file per result-page section (Itinerary, Weather, TripChat, ...)
  utils/        Non-UI logic: Gemini client, prompt building, schemas,
                geocoding, FX, weather, sharing, local storage
  pdf/          TripPdfDocument.js — the PDF layout (React.createElement,
                no JSX, since it renders via @react-pdf/renderer, not the DOM)
api/
  gemini.js     Proxies Gemini requests (streaming + non-streaming)
  pdf.js        Renders a trip to PDF server-side
  share.js      Stores/retrieves shared trips in Upstash Redis
```

## Deployment

Connected directly to this GitHub repo — every push to `main` triggers a
Vercel build and deploy automatically. There's no separate staging
environment.

## Known limitations

- Gemini's free tier caps requests per day per model; a single "Generate"
  can cost more than one request if a retry fires, so the quota can run out
  mid-session on a busy day.
- The main model has needed to change more than once as Google's free-tier
  availability and quotas shifted — it isn't treated as a permanently
  settled choice.
- No free real-time flight-price API currently exists (the previously-free
  options have closed off self-serve access), so flight costs remain an
  LLM estimate rather than a live fare lookup.
- The password gate is a deterrent, not security — treat it like a private
  link, not an access-control boundary.

For a more detailed walkthrough of the architecture and the reasoning
behind specific engineering decisions, see
[`docs/handbook.html`](docs/handbook.html) — open it directly in a
browser, no build step needed.
