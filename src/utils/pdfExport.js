import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import logger from "./logger";

/**
 * Captures a DOM element and saves it as a multi-page PDF.
 * @param {HTMLElement} element - the element to capture (e.g. the trip result container)
 * @param {string} filename - filename without extension
 */
export async function exportElementToPdf(element, filename = "trip") {
  if (!element) {
    throw new Error("Nothing to export — trip content not found.");
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#F7F4EE",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
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
      pdf.addPage([pageWidth, pageHeight]);
      pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${filename}.pdf`);
  } catch (err) {
    logger.error("PDF export failed:", err);
    throw new Error("Couldn't generate the PDF. Please try again.");
  }
}