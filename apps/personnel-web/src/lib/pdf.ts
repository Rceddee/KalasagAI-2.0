import { jsPDF } from "jspdf";
import type { IncidentRecord } from "@/lib/types";
import { categoryLabel, formatDate, statusLabel } from "@/lib/incidents";

export function exportIncidentPdf(records: IncidentRecord[], title: string) {
  const document = new jsPDF();
  let y = 18;
  document.setFontSize(16);
  document.text("KALASAGAI · " + title, 14, y);
  y += 9;
  document.setFontSize(9);
  document.text(`Generated ${formatDate(new Date().toISOString())} · ${records.length} authorized records`, 14, y);
  y += 9;

  for (const record of records) {
    const description = document.splitTextToSize(record.description, 175);
    const location = document.splitTextToSize(record.location_label, 175);
    const blockHeight = 33 + description.length * 4 + location.length * 4;
    if (y + blockHeight > 280) {
      document.addPage();
      y = 18;
    }
    document.setFont("helvetica", "bold");
    document.text(`${record.reference} · ${statusLabel(record.status)}`, 14, y);
    y += 5;
    document.setFont("helvetica", "normal");
    document.text(`Category: ${categoryLabel(record.confirmed_category ?? record.suggested_category)}`, 14, y);
    y += 5;
    document.text(`Priority: ${record.priority_level?.toUpperCase() ?? "PENDING"}`, 14, y);
    y += 5;
    document.text(`Location: ${location}`, 14, y);
    y += location.length * 4 + 1;
    document.text(`Description: ${description}`, 14, y);
    y += description.length * 4 + 1;
    document.text(`Submitted: ${formatDate(record.created_at)}`, 14, y);
    y += 8;
  }

  document.save(`kalasagai-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.pdf`);
}
