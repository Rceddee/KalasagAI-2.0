import type { BlotterPdfRecord } from "@/lib/types";

export async function downloadRecordsPdf({
  title,
  filename,
  headers,
  rows,
}: {
  title: string;
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 16;
  const generatedAt = new Date().toLocaleString("en-PH");
  let pageNumber = 1;
  let y = 36;

  const drawPageHeader = () => {
    pdf.setFillColor(10, 33, 61);
    pdf.rect(0, 0, pageWidth, 27, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("KALASAG AI | MDRRMO GUMACA", margin, 10);
    pdf.setFontSize(15);
    pdf.text(title, margin, 20);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Generated ${generatedAt} | Page ${pageNumber}`, pageWidth - margin, 10, { align: "right" });
    pdf.setTextColor(15, 23, 42);
    y = 35;
  };

  const addPage = () => {
    pdf.addPage();
    pageNumber += 1;
    drawPageHeader();
  };

  drawPageHeader();
  if (rows.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("No records in this export.", margin, y);
  }

  rows.forEach((row, rowIndex) => {
    const values = headers.map((_, index) => String(row[index] ?? "N/A"));
    const recordTitle = `${headers[0] || "Record"}: ${values[0] || rowIndex + 1}`;

    if (y + 12 > bottomLimit) addPage();
    pdf.setFillColor(234, 242, 250);
    pdf.roundedRect(margin, y, contentWidth, 7, 1, 1, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(10, 33, 61);
    pdf.text(pdf.splitTextToSize(recordTitle, contentWidth - 6)[0], margin + 3, y + 4.8);
    y += 10;

    values.slice(1).forEach((value, valueIndex) => {
      const label = headers[valueIndex + 1] || `Field ${valueIndex + 2}`;
      const lines = pdf.splitTextToSize(value || "N/A", contentWidth - 47);
      pdf.setFontSize(8);
      let lineIndex = 0;

      while (lineIndex < lines.length) {
        if (y + 5 > bottomLimit) addPage();
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(71, 85, 105);
        pdf.text(pdf.splitTextToSize(label, 40)[0], margin + 2, y + 3.3);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(15, 23, 42);
        pdf.text(lines[lineIndex], margin + 45, y + 3.3);
        y += 4.5;
        lineIndex += 1;
      }
    });

    y += 2;
    pdf.setDrawColor(218, 226, 235);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 4;
  });

  const pageCount = pdf.getNumberOfPages();
  for (let currentPage = 1; currentPage <= pageCount; currentPage += 1) {
    pdf.setPage(currentPage);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text("KALASAG AI Emergency Platform | Data Privacy Act of 2012 (RA 10173)", margin, pageHeight - 7);
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export async function downloadChartPdf(imageData: string, title: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const image = pdf.getImageProperties(imageData);
  const maxWidth = pageWidth - 24;
  const maxHeight = pageHeight - 52;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(title, 12, 16);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Generated ${new Date().toLocaleString("en-PH")}`, 12, 22);
  pdf.addImage(imageData, "PNG", (pageWidth - width) / 2, 30 + (maxHeight - height) / 2, width, height);
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export async function downloadSingleBlotterPdf(incident: BlotterPdfRecord) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // Header band
  pdf.setFillColor(10, 33, 61);
  pdf.rect(0, 0, pageWidth, 32, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("REPUBLIC OF THE PHILIPPINES | PROVINCE OF QUEZON", margin, 12);
  pdf.setFontSize(16);
  pdf.text("MDRRMO GUMACA - OFFICIAL INCIDENT BLOTTER", margin, 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`KALASAG AI SYSTEM RECORD`, pageWidth - margin, 12, { align: "right" });

  let y = 44;
  pdf.setTextColor(15, 23, 42);

  // Reference & Date Box
  pdf.setFillColor(243, 246, 249);
  pdf.setDrawColor(218, 226, 235);
  pdf.roundedRect(margin, y, contentWidth, 18, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(`Blotter Ref: ${incident.reference || incident.id}`, margin + 5, y + 8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  const dateStr = incident.created_at ? new Date(incident.created_at).toLocaleString("en-PH") : "N/A";
  pdf.text(`Date Filed: ${dateStr}`, margin + 5, y + 14);
  pdf.text(`Status: ${incident.status?.toUpperCase() || "PENDING"}`, pageWidth - margin - 5, y + 14, { align: "right" });

  y += 26;

  const addField = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(71, 85, 105);
    pdf.text(label, margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(15, 23, 42);
    const split = pdf.splitTextToSize(value || "N/A", contentWidth - 45);
    pdf.text(split, margin + 45, y);
    y += Math.max(8, split.length * 5 + 3);
  };

  addField("Incident Category:", incident.confirmed_category || incident.suggested_category || incident.category || "Unclassified");
  addField("Priority:", incident.priority_level?.toUpperCase() || "Pending AI assessment");
  addField("Location:", `${incident.location_label || "Gumaca, Quezon"} (${incident.latitude?.toFixed(5) || "N/A"}, ${incident.longitude?.toFixed(5) || "N/A"})`);
  addField("Incident Details:", incident.description || "No description provided");

  const aiAssessment = incident.ai_reasoning || incident.rationale;
  if (aiAssessment) {
    addField("AI Assessment:", aiAssessment);
  }
  if (incident.reporter_name) {
    addField("Reporter Name:", incident.reporter_name);
  }
  if (incident.reporter_contact) {
    addField("Reporter Contact:", incident.reporter_contact);
  }

  y += 10;
  pdf.setDrawColor(200, 210, 220);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 15;

  // Signatures
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);
  pdf.text("CERTIFIED TRUE AND OFFICIAL EXTRACT:", margin, y);

  y += 24;
  pdf.line(margin, y, margin + 60, y);
  pdf.line(pageWidth - margin - 60, y, pageWidth - margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Duty Officer / Communications Specialist", margin, y);
  pdf.text("MDRRMO Operations Head", pageWidth - margin - 60, y);

  // Footer
  pdf.setFontSize(7);
  pdf.text("KALASAG AI Emergency Platform | Data Privacy Act of 2012 (RA 10173)", margin, pageHeight - 8);

  const refName = (incident.reference || incident.id || "blotter").replace(/[^a-zA-Z0-9_-]/g, "_");
  pdf.save(`BLOTTER_${refName}.pdf`);
}
