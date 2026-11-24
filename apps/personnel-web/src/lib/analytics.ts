import type { IncidentRecord } from "./types";

type ClassificationReview = Pick<IncidentRecord, "suggested_category" | "confirmed_category">;

export interface AiAccuracyMetrics {
  accuracyPercent: number | null;
  reviewedCount: number;
}

export function calculateAiAccuracy(records: readonly ClassificationReview[]): AiAccuracyMetrics {
  const reviewedRecords = records.filter(
    (record) => record.suggested_category != null && record.confirmed_category != null,
  );

  if (reviewedRecords.length === 0) {
    return { accuracyPercent: null, reviewedCount: 0 };
  }

  const matches = reviewedRecords.filter(
    (record) => record.confirmed_category === record.suggested_category,
  ).length;

  return {
    accuracyPercent: (matches / reviewedRecords.length) * 100,
    reviewedCount: reviewedRecords.length,
  };
}

export function getAnalyticsCategory(incident: ClassificationReview): string {
  const category = incident.confirmed_category ?? incident.suggested_category;
  if (!category) return "Unclassified";
  return {
    flooding: "Flooding", fire: "Fire", road_obstruction: "Road Obstruction",
    road_accident: "Road Accident", medical_emergency: "Medical", other: "Other",
  }[category];
}
