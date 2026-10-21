/**
 * Pure unit tests for lib/stats.ts — run with Node's built-in test runner:
 *   node lib/stats.test.ts
 * (Node ≥ 23 strips TypeScript types natively.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  HOUR_BLOCKS,
  averageProcessingMs,
  changePercent,
  countByPrediction,
  filterByPeriod,
  heatmapMatrix,
  periodRange,
  previousPeriodCount,
  seriesForChart,
  triageBreakdown,
  type StatsEntry,
} from "./stats.ts";

const NOW = new Date("2026-10-15T10:00:00Z").getTime();
const DAY = 24 * 3600 * 1000;

function entry(overrides: Partial<StatsEntry> & { msAgo: number }): StatsEntry {
  const { msAgo, ...rest } = overrides;
  return {
    timestamp: new Date(NOW - msAgo).toISOString(),
    prediction: "Normal",
    model_score: 0.9,
    is_uncertain: false,
    risk_level: "Low Priority (Routine)",
    ...rest,
  };
}

/** Timestamp at a given local hour N days before NOW (tz-independent round trip). */
function atLocal(dayOffset: number, hour: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

test("filterByPeriod keeps only entries inside the window", () => {
  const entries = [
    entry({ msAgo: 1000 }),
    entry({ msAgo: 2 * DAY - 1000 }),
    entry({ msAgo: 10 * DAY }),
    entry({ msAgo: 200 * DAY }),
  ];
  assert.equal(filterByPeriod(entries, "week", NOW).length, 2);
  assert.equal(filterByPeriod(entries, "month", NOW).length, 3);
  assert.equal(filterByPeriod(entries, "year", NOW).length, 4);
});

test("previousPeriodCount counts the window before the selected one", () => {
  const entries = [
    entry({ msAgo: 1000 }),
    entry({ msAgo: 10 * DAY }),
    entry({ msAgo: 9 * DAY }),
    entry({ msAgo: 13.9 * DAY }),
  ];
  assert.equal(previousPeriodCount(entries, "week", NOW), 3);
  assert.equal(previousPeriodCount(entries, "month", NOW), 0);
});

test("countByPrediction buckets normal, pneumonia, uncertain and triage tiers", () => {
  const entries = [
    entry({ msAgo: 0 }),
    entry({ msAgo: DAY, prediction: "Pneumonia", risk_level: "High Priority (Referral)" }),
    entry({ msAgo: 2 * DAY, is_uncertain: true, risk_level: "Inconclusive (Human Review)" }),
    entry({ msAgo: 3 * DAY, risk_level: "Moderate Priority (Re-review)" }),
  ];
  const c = countByPrediction(entries);
  assert.equal(c.total, 4);
  assert.equal(c.normal, 2);
  assert.equal(c.pneumonia, 1);
  assert.equal(c.uncertain, 1);
  assert.equal(c.flaggedForReview, 1);
  assert.equal(c.low, 2);
  assert.equal(c.moderate, 1);
  assert.equal(c.high, 1);
});

test("seriesForChart('week') returns 7 day buckets oldest-first", () => {
  const entries = [
    { ...entry({ msAgo: 0 }), timestamp: atLocal(0, 10), prediction: "Pneumonia" },
    { ...entry({ msAgo: 0 }), timestamp: atLocal(3, 2) },
    { ...entry({ msAgo: 0 }), timestamp: atLocal(6, 5), is_uncertain: true },
  ];
  const s = seriesForChart(entries, "week", NOW);
  assert.equal(s.length, 7);
  // oldest bucket = 6 days ago (local midnight)
  assert.equal(s[0].uncertain, 1);
  assert.equal(s[3].normal, 1);
  assert.equal(s[6].pneumonia, 1);
  assert.equal(s[1].normal + s[1].pneumonia + s[1].uncertain, 0);
  const dayStart6 = new Date(NOW);
  dayStart6.setDate(dayStart6.getDate() - 6);
  assert.equal(
    s[0].label,
    dayStart6.toLocaleDateString(undefined, { weekday: "short" })
  );
});

test("seriesForChart('month') returns 5 weekly buckets oldest-first", () => {
  const entries = [
    entry({ msAgo: 1000, prediction: "Pneumonia" }),
    entry({ msAgo: 29 * DAY }),
  ];
  const s = seriesForChart(entries, "month", NOW);
  assert.equal(s.length, 5);
  assert.equal(s[0].label, "-4w");
  assert.equal(s[4].label, "Now");
  assert.equal(s[4].pneumonia, 1);
  assert.equal(s[0].normal, 1);
});

test("seriesForChart('year') returns 12 monthly buckets", () => {
  const entries = [entry({ msAgo: 1000 }), entry({ msAgo: 330 * DAY, prediction: "Pneumonia" })];
  const s = seriesForChart(entries, "year", NOW);
  assert.equal(s.length, 12);
  assert.equal(s[0].pneumonia, 1);
  assert.equal(s[11].normal, 1);
});

test("heatmapMatrix is 6×7 and lands hits in the right cell", () => {
  const entries = [
    { ...entry({ msAgo: 0 }), timestamp: atLocal(0, 10) }, // today, 10:00 local
    { ...entry({ msAgo: 0 }), timestamp: atLocal(4, 13) }, // 4 days ago, 13:00
  ];
  const { matrix } = heatmapMatrix(entries, NOW);
  assert.equal(matrix.length, 6);
  assert.equal(matrix[0].length, 7);
  const todayCol = (new Date(atLocal(0, 10)).getDay() + 6) % 7;
  assert.equal(matrix[1][todayCol], 1); // 10:00 → block starting 10am
  const pastCol = (new Date(atLocal(4, 13)).getDay() + 6) % 7;
  assert.equal(matrix[2][pastCol], 1); // 13:00 → 12pm block
  assert.equal(HOUR_BLOCKS.length, 6);
});

test("triageBreakdown sums tiers to total", () => {
  const entries = [
    entry({ msAgo: 0, risk_level: "High Priority (Referral)" }),
    entry({ msAgo: DAY, risk_level: "Moderate Priority (Re-review)" }),
    entry({ msAgo: 2 * DAY, risk_level: "Low Priority (Routine)" }),
    entry({ msAgo: 3 * DAY, risk_level: "Inconclusive (Human Review)" }),
  ];
  const t = triageBreakdown(entries);
  assert.equal(t.high, 1);
  assert.equal(t.moderate, 1);
  // Inconclusive falls back to low tier for referral sorting
  assert.equal(t.low, 2);
  assert.equal(t.total, 4);
  assert.equal(t.low + t.moderate + t.high, t.total);
});

test("changePercent handles zero baselines", () => {
  assert.equal(changePercent(10, 8), 25);
  assert.equal(changePercent(5, 10), -50);
  assert.equal(changePercent(3, 0), 100);
  assert.equal(changePercent(0, 0), null);
});

test("averageProcessingMs ignores missing values", () => {
  const entries = [
    entry({ msAgo: 0, processing_ms: 300 }),
    entry({ msAgo: DAY, processing_ms: 500 }),
    entry({ msAgo: 2 * DAY }),
  ];
  assert.equal(averageProcessingMs(entries), 400);
  assert.equal(averageProcessingMs([]), null);
});

test("periodRange returns the window bounds", () => {
  const { start, end } = periodRange("week", NOW);
  const dayStart6 = new Date(NOW);
  dayStart6.setDate(dayStart6.getDate() - 6);
  dayStart6.setHours(0, 0, 0, 0);
  assert.equal(start, dayStart6.getTime());
  assert.equal(end, NOW);
});
