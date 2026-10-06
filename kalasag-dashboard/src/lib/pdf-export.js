export async function downloadRecordsPdf({ title, filename, headers, rows }) {
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

export async function downloadChartPdf(imageData, title, filename) {
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