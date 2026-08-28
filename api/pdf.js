import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import TripPdfDocument from "../src/pdf/TripPdfDocument.js";

const h = React.createElement;

// react-pdf's built-in standard fonts (Helvetica/Times) only cover
// WinAnsiEncoding (Windows-1252). Found this the hard way: a plain arrow
// and an approx-equal sign in our own template strings rendered as garbled
// characters in a test render. Fixed those directly in TripPdfDocument.js,
// but AI-generated free text (descriptions, tips, notes) isn't under our
// control the same way, and this app leans heavily on INR -- the rupee
// sign is a real risk there since it postdates Windows-1252.
//
// Deliberately just a targeted replacement list, not a blanket "strip
// anything above codepoint 255" filter -- WinAnsiEncoding isn't a simple
// numeric range (it also maps several codepoints above 255, like the Euro
// sign and the smart-quote/em-dash cluster this document already relies on
// elsewhere), so a naive range check would strip characters that actually
// render fine.
const CHAR_REPLACEMENTS = {
  "₹": "Rs.", // rupee sign
  "→": " to ", // rightwards arrow
  "←": " from ", // leftwards arrow
  "≈": "approx.", // almost equal to
};

function sanitizeText(str) {
  let out = str;
  for (const [bad, good] of Object.entries(CHAR_REPLACEMENTS)) {
    out = out.split(bad).join(good);
  }
  return out;
}

function sanitizeTripText(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeTripText);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = sanitizeTripText(val);
    }
    return out;
  }
  return value;
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const trip = body?.trip ? sanitizeTripText(body.trip) : null;
    if (!trip) {
      return Response.json({ error: "Missing trip data." }, { status: 400 });
    }

    try {
      const buffer = await renderToBuffer(h(TripPdfDocument, { trip }));
      const filename = `AbhiTrip-${(trip.input?.destination || "trip").replace(/\s+/g, "-")}.pdf`;

      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch (err) {
      return Response.json(
        { error: err?.message || "PDF generation failed." },
        { status: 500 }
      );
    }
  },
};
