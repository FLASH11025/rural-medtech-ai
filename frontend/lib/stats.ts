/**
 * Pure statistics helpers for the Dashboard.
 * No React, no Date.now(), no side effects — all take an explicit `now`
 * so results are deterministic and unit-testable.
 */

export type Period = "week" | "month" | "year";

export interface StatsEntry {
  timestamp: string;
  prediction: "Normal" | "Pneumonia";
  model_score: number;
  is_uncertain: boolean;
  risk_level: string;
  processing_ms?: number;
}

const DAY_MS = 24 * 3600 * 1000;
const PERIOD_MS: Record<Period, number> = {
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
};

/** Rows of hour buckets for the activity heatmap, labels included. */
export const HOUR_BLOCKS: { label: string; startHour: number }[] = [
  { label: "8am", startHour: 8 },
  { label: "10am", startHour: 10 },
  { label: "12pm", startHour: 12 },
  { label: "2pm", startHour: 14 },
  { label: "4pm", startHour: 16 },
  { label: "6pm", startHour: 18 },
];
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** weeks bucket (old→new) / months bucket labels */
export const MONTH_BUCKETS = 5;

function localDay(t: number): number {
  // 0 = Monday … 6 = Sunday
  return (new Date(t).getDay() + 6) % 7;
}

/** Start of the current period (calendar-aligned for weeks, raw for month/year). */
export function periodStart(period: Period, now: number): number {
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return now - PERIOD_MS[period];
}

/** Entries within the selected period (newest first, stable order). */
export function filterByPeriod<T extends StatsEntry>(
  entries: T[],
  period: Period,
  now: number
): T[] {
  const from = periodStart(period, now);
  return entries.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return t >= from && t <= now + 1;
  });
}

/** Number of entries in the period *before* the selected one (for change %). */
export function previousPeriodCount<T extends StatsEntry>(
  entries: T[],
  period: Period,
  now: number
): number {
  const to = now - PERIOD_MS[period];
  const from = to - PERIOD_MS[period];
  return entries.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return t >= from && t < to;
  }).length;
}

export interface PredictionCounts {
  total: number;
  normal: number;
  pneumonia: number;
  uncertain: number;
  flaggedForReview: number;
  low: number;
  moderate: number;
  high: number;
}

function riskTier(risk_level: string): "low" | "moderate" | "high" {
  const r = risk_level.toLowerCase();
  if (r.includes("high")) return "high";
  if (r.includes("moderate")) return "moderate";
  return "low";
}

export function countByPrediction<T extends StatsEntry>(entries: T[]): PredictionCounts {
  const c: PredictionCounts = {
    total: entries.length,
    normal: 0,
    pneumonia: 0,
    uncertain: 0,
    flaggedForReview: 0,
    low: 0,
    moderate: 0,
    high: 0,
  };
  for (const e of entries) {
    if (e.is_uncertain) {
      c.uncertain += 1;
    } else if (e.prediction === "Pneumonia") {
      c.pneumonia += 1;
    } else {
      c.normal += 1;
    }
    c[riskTier(e.risk_level)] += 1;
  }
  c.flaggedForReview = c.pneumonia;
  return c;
}

export interface SeriesBucket {
  label: string;
  normal: number;
  pneumonia: number;
  uncertain: number;
}

/** Time series for the trends chart (old → new along the x-axis).
 *  Week: day buckets · Month: 5-week buckets · Year: 12-month buckets. */
export function dailySeries<T extends StatsEntry>(
  entries: T[],
  period: Period,
  now: number
): SeriesBucket[] {
  const from = now - PERIOD_MS[period];
  const buckets: SeriesBucket[] = [];
  let indexFor: (t: number) => number;

  if (period === "week") {
    const starts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      starts.push(d.getTime());
    }
    for (const s of starts) {
      buckets.push({
        label: new Date(s).toLocaleDateString(undefined, { weekday: "short" }),
        normal: 0,
        pneumonia: 0,
        uncertain: 0,
      });
    }
    indexFor = (t) => {
      for (let j = starts.length - 1; j >= 0; j--) {
        if (t >= starts[j]) return j;
      }
      return 0;
    };
  } else if (period === "month") {
    for (let i = 0; i < MONTH_BUCKETS; i++) {
      buckets.push({ label: i === 0 ? "Now" : `-${i}w`, normal: 0, pneumonia: 0, uncertain: 0 });
    }
    indexFor = (t) => Math.min(MONTH_BUCKETS - 1, Math.floor((now - t) / (7 * DAY_MS)));
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now - i * 30 * DAY_MS);
      buckets.push({
        label: d.toLocaleDateString(undefined, { month: "short" }),
        normal: 0,
        pneumonia: 0,
        uncertain: 0,
      });
    }
    indexFor = (t) =>
      11 - Math.max(0, Math.min(11, Math.floor((now - t) / (30 * DAY_MS))));
  }

  for (const e of entries) {
    const t = new Date(e.timestamp).getTime();
    if (t < from) continue;
    const idx = indexFor(t);
    if (idx < 0 || idx >= buckets.length) continue;
    if (e.is_uncertain) buckets[idx].uncertain += 1;
    else if (e.prediction === "Pneumonia") buckets[idx].pneumonia += 1;
    else buckets[idx].normal += 1;
  }
  return buckets; // oldest first: index 0 == oldest bucket for week/year; for month idx0 = now — reversed below
}

/** Normalise so that ALL series come out oldest-first for charting. */
export function seriesForChart<T extends StatsEntry>(
  entries: T[],
  period: Period,
  now: number
): SeriesBucket[] {
  const b = dailySeries(entries, period, now);
  return period === "month" ? [...b].reverse() : b;
}

/** 6×7 matrix [hourBlock][dayCol] of scan counts (local time). */
export function heatmapMatrix<T extends StatsEntry>(
  entries: T[],
  now: number
): { matrix: number[][] } {
  const rows = HOUR_BLOCKS.length; // 6
  const cols = DAY_LABELS.length; // 7
  const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  const from = now - PERIOD_MS.year; // heatmap window trailing year
  for (const e of entries) {
    const t = new Date(e.timestamp).getTime();
    if (t < from) continue;
    const d = new Date(t);
    const dayCol = localDay(d.getTime());
    const hour = d.getHours();
    const rowIdx = HOUR_BLOCKS.findIndex((b) => hour >= b.startHour && hour < b.startHour + 2);
    if (rowIdx >= 0) matrix[rowIdx][dayCol] += 1;
  }
  return { matrix };
}

export interface TriageBreakdown {
  low: number;
  moderate: number;
  high: number;
  total: number;
}

export function triageBreakdown<T extends StatsEntry>(entries: T[]): TriageBreakdown {
  const c = countByPrediction(entries);
  return { low: c.low, moderate: c.moderate, high: c.high, total: c.total };
}

/** Percent change; returns null when both periods are empty, 100 when
 *  previous is empty but current is not. */
export function changePercent(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function averageProcessingMs<T extends StatsEntry>(entries: T[]): number | null {
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    if (typeof e.processing_ms === "number" && e.processing_ms > 0) {
      sum += e.processing_ms;
      n += 1;
    }
  }
  return n > 0 ? Math.round(sum / n) : null;
}

export function periodRange(period: Period, now: number): { start: number; end: number } {
  return { start: periodStart(period, now), end: now };
}

export const PERIOD_BUCKETS: Record<Period, number> = {
  week: 7,
  month: MONTH_BUCKETS,
  year: 12,
};
