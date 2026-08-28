/**
 * Requests a PDF of the trip from the server (api/pdf.js, which renders it
 * natively with @react-pdf/renderer from the trip data) and triggers a
 * browser download of the result.
 *
 * This replaces the old html2canvas + jsPDF approach, which screenshotted
 * the live DOM and sliced the image into pages — fragile by nature (we hit
 * four separate classes of bug from it: a jsPDF page-size cap silently
 * corrupting pagination, a horizontal-scroll section getting clipped out of
 * the capture entirely, a CSS animation replaying mid-capture and washing
 * out every color, and page breaks landing mid-card with no awareness of
 * the content's structure). Generating from the trip data directly sidesteps
 * all of that: real vector text, no DOM/timing dependency, and pagination
 * react-pdf handles natively.
 *
 * @param {Object} trip - the full trip object
 * @param {string} filename - filename without extension
 */
export async function exportTripToPdf(trip, filename = "trip") {
  if (!trip) {
    throw new Error("Nothing to export — trip content not found.");
  }

  let res;
  try {
    res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip }),
    });
  } catch {
    throw new Error("Couldn't reach the PDF service. Please try again.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || "Couldn't generate the PDF. Please try again.");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
