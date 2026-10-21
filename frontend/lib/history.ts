"use client";
import { useCallback, useEffect, useState } from "react";
import type { AnalysisResult } from "./types";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  prediction: "Normal" | "Pneumonia";
  model_score: number;
  is_uncertain: boolean;
  risk_level: string;
  /** Softmax confidence of the prediction (max softmax probability, 0..1). */
  confidence?: number;
  /** Client-measured end-to-end analysis latency in milliseconds. */
  processing_ms?: number;
  /** True for generated sample data — never set on real scans. */
  is_sample?: boolean;
}

const STORAGE_KEY = "medtech_history";
export const HISTORY_STORAGE_KEY = STORAGE_KEY;
const MAX_ENTRIES = 200;

export function readHistory(): HistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(
  result: AnalysisResult,
  extras?: Partial<Pick<HistoryEntry, "confidence" | "processing_ms">>
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const existing = readHistory();
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      prediction: result.prediction,
      model_score: result.model_score,
      is_uncertain: result.is_uncertain,
      risk_level: result.risk_level,
      confidence: extras?.confidence ?? Math.max(result.model_score, 1 - result.model_score),
      processing_ms: extras?.processing_ms,
    };
    const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage unavailable — fail silently
  }
}

export function clearHistoryStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

export function deleteHistoryEntry(id: string): HistoryEntry[] {
  const updated = readHistory().filter((h) => h.id !== id);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // noop
    }
  }
  return updated;
}

/* ============================================================
   SAMPLE DATA (explicitly flagged, never mixed silently)
   ============================================================ */

const SAMPLE_DAYS = 60;

function riskFor(confidence: number, uncertain: boolean): string {
  if (uncertain) return "Inconclusive (Human Review)";
  if (confidence > 0.75) return "High Priority (Referral)";
  if (confidence > 0.40) return "Moderate Priority (Re-review)";
  return "Low Priority (Routine)";
}

/** Generates clearly-labelled sample entries over the past N days.
 *  Only call when history is empty — never mixes with real scans. */
export function loadSampleData(now: number = Date.now()): void {
  if (typeof localStorage === "undefined") return;
  if (readHistory().length > 0) return; // guard: never overwrite real scans
  const entries: HistoryEntry[] = [];
  for (let day = SAMPLE_DAYS - 1; day >= 0; day--) {
    const perDay = 1 + ((day * 7919) % 3); // deterministic 1–3 scans/day
    for (let s = 0; s < perDay; s++) {
      const seed = (day * 31 + s * 17) % 100;
      const hour = 8 + ((seed % 6) * 2) + 1; // hour blocks 9,11,13,15,17,19 → heatmap zones
      const timestamp = new Date(
        now - day * 864e5 - (hour * 3600 + (seed % 59) * 60) * 1000
      ).toISOString();
      const uncertain = seed % 10 === 3;
      let score: number;
      if (uncertain) score = 0.45 + ((seed % 20) / 100); // 0.45–0.64 < 0.55 gate varies
      else if (seed % 7 === 0) score = 0.76 + ((seed % 24) / 100); // pneumonia leaning
      else score = 0.78 + ((seed % 22) / 100);
      const prediction: "Normal" | "Pneumonia" =
        seed % 7 === 0 && !uncertain ? "Pneumonia" : "Normal";
      entries.push({
        id: `sample-${day}-${s}`,
        timestamp,
        prediction,
        model_score: Math.min(score, 0.99),
        is_uncertain: uncertain,
        risk_level: riskFor(Math.max(score, 1 - score), uncertain),
        confidence: Math.max(score, 1 - score),
        processing_ms: 280 + ((seed * 13) % 260),
        is_sample: true,
      });
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // noop
  }
}

export function clearSampleData(): HistoryEntry[] {
  const updated = readHistory().filter((h) => !h.is_sample);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // noop
    }
  }
  return updated;
}

export function hasSampleData(entries: HistoryEntry[]): boolean {
  return entries.some((h) => h.is_sample === true);
}

/* ============================================================
   SHARED HOOK — cross-tab live updates via the storage event
   ============================================================ */

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const read = () => setEntries(readHistory());
    const t = setTimeout(() => {
      read();
      setLoaded(true);
    }, 0);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(t);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries(deleteHistoryEntry(id));
  }, []);

  const refresh = useCallback(() => {
    setEntries(readHistory());
  }, []);

  return { entries, loaded, removeEntry, refresh };
}
