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

// Cards/blocks that should never be sliced across a page boundary. The
// export is one giant screenshot cut into page-height chunks, so without
// this the cut falls wherever the fixed page height happens to land —
// straight through a card, a day's itinerary, etc.
const NO_SPLIT_SELECTOR = [
  ".hero",
  ".trip-stub",
  ".attraction-card",
  ".weather-month",
  ".timeline-day",
  ".flights-card",
  ".currency-card",
  ".dish-card",
  ".shopping-item",
  ".packing-category",
  ".budget-bar-row",
].join(", ");

/**
 * Returns the top/bottom of every no-split block, in CSS px relative to the
 * captured element's top edge. Measured from the live DOM before rasterizing
 * (not the canvas), then later converted into the PDF's coordinate space.
 */
function getNoSplitRanges(element) {
  const elementTop = element.getBoundingClientRect().top;
  const ranges = Array.from(element.querySelectorAll(NO_SPLIT_SELECTOR)).map((node) => {
    const rect = node.getBoundingClientRect();
    return [rect.top - elementTop, rect.bottom - elementTop];
  });
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges;
}

/**
 * Nudges an ideal page-break position to avoid landing inside a no-split
 * range. Prefers ending the page early (right before the block) unless that
 * would leave the page mostly empty, in which case it extends the page to
 * swallow the whole block instead.
 */
function findSafeBreak(idealY, ranges, pageHeight, prevBreakY) {
  for (const [top, bottom] of ranges) {
    if (idealY > top && idealY < bottom) {
      const contentIfSnappedBack = top - prevBreakY;
      return contentIfSnappedBack >= pageHeight * 0.3 ? top : bottom;
    }
  }
  return idealY;
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

    const elementWidth = element.getBoundingClientRect().width;
    const noSplitRanges = getNoSplitRanges(element);

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
    // isn't squeezed or cut off awkwardly across pages. Break points are
    // nudged (via noSplitRanges) to land in the gap between cards rather
    // than at a fixed pixel offset that might fall right through one.
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    // Convert the no-split ranges (measured in DOM CSS px) into the same
    // unit space as pageHeight/imgHeight above — no need to know
    // html2canvas's internal scale factor, since both the image and the
    // element share one width ratio.
    const pdfUnitsPerCssPixel = pageWidth / elementWidth;
    const noSplitRangesPdf = noSplitRanges.map(([top, bottom]) => [
      top * pdfUnitsPerCssPixel,
      bottom * pdfUnitsPerCssPixel,
    ]);

    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, imgHeight);

    let breakY = findSafeBreak(pageHeight, noSplitRangesPdf, pageHeight, 0);

    while (breakY < imgHeight) {
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, -breakY, pageWidth, imgHeight);
      const idealNext = breakY + pageHeight;
      breakY = findSafeBreak(idealNext, noSplitRangesPdf, pageHeight, breakY);
    }

    pdf.save(`${filename}.pdf`);
  } catch (err) {
    logger.error("PDF export failed:", err);
    throw new Error("Couldn't generate the PDF. Please try again.");
  } finally {
    element.classList.remove("pdf-exporting");
  }
}