import assert from "node:assert/strict";
import test from "node:test";
import { calculateAiAccuracy, getAnalyticsCategory } from "../src/lib/analytics";

test("AI accuracy is unavailable without records containing both categories", () => {
  assert.deepEqual(calculateAiAccuracy([]), { accuracyPercent: null, reviewedCount: 0 });
  assert.deepEqual(
    calculateAiAccuracy([
      { suggested_category: null, confirmed_category: "fire" },
      { suggested_category: "flooding", confirmed_category: null },
    ]),
    { accuracyPercent: null, reviewedCount: 0 },
  );
});

test("AI accuracy uses only fully reviewed suggestions", () => {
  assert.deepEqual(
    calculateAiAccuracy([
      { suggested_category: "fire", confirmed_category: "fire" },
      { suggested_category: "flooding", confirmed_category: "medical_emergency" },
      { suggested_category: null, confirmed_category: "road_accident" },
    ]),
    { accuracyPercent: 50, reviewedCount: 2 },
  );
});

test("category statistics keep road accidents, obstructions and unclassified reports separate", () => {
  assert.equal(getAnalyticsCategory({ suggested_category: "road_accident", confirmed_category: null }), "Road Accident");
  assert.equal(getAnalyticsCategory({ suggested_category: "road_accident", confirmed_category: "road_obstruction" }), "Road Obstruction");
  assert.equal(getAnalyticsCategory({ suggested_category: null, confirmed_category: null }), "Unclassified");
});
