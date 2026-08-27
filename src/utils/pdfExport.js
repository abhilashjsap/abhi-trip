import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import logger from "./logger";

/**
 * Waits for every <img> inside an element to finish loading (or fail) before
 * resolving. html2canvas captures whatever is in the DOM at the moment it
 * runs — an <img> that hasn't loaded yet (native `loading="lazy"`, or just a
 * slow Unsplash fetch that hadn't settled when the user clicked export)
 * renders as blank, which reads as "faded" content in the output.
 */
function waitForImages(element, timeoutMs = 8000) {
  const images = Array.from(element.querySelectorAll("img"));
  return Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, timeoutMs);
      });
    })
  );
}

/**
 * Captures a DOM element and saves it as a multi-page PDF.
 * @param {HTMLElement} element - the element to capture (e.g. the trip result container)
 * @param {string} filename - filename without extension
 */
export async function exportElementToPdf(element, filename = "trip") {
  if (!element) {
    throw new Error("Nothing to export — trip content not found.");
  }

  // The attractions row is a horizontal-scroll carousel (overflow-x: auto) —
  // html2canvas only captures what's within an element's clipped bounds, so
  // any card scrolled out of view would be missing from the export
  // entirely. Temporarily let it wrap into a full grid for the capture.
  element.classList.add("pdf-exporting");

  try {
    await waitForImages(element);

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#F7F4EE",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    // A real, fixed page size (A4) rather than one page sized to fit the
    // entire captured canvas. Sizing the page to canvas.width/height broke
    // silently for any reasonably long trip: jsPDF hard-caps page
    // dimensions at 14400 "userUnit" and clamps anything taller with just
    // a console warning, which threw off all the pagination math below
    // (computed against the real height, not the clamped one) and made
    // later content render at the wrong offset — the "fading to blank"
    // look was image content being drawn off-page, not a quality issue.
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: "a4",
    });

    // Paginate: split the tall canvas into page-height chunks so content
    // isn't squeezed or cut off awkwardly across pages.
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${filename}.pdf`);
  } catch (err) {
    logger.error("PDF export failed:", err);
    throw new Error("Couldn't generate the PDF. Please try again.");
  } finally {
    element.classList.remove("pdf-exporting");
  }
}