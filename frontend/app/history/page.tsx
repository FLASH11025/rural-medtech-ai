"use client";
import { useState, useEffect } from "react";
import { BottomNav, TopBar } from "../components/ui";
import type { AnalysisResult } from "../../lib/types";

interface HistoryEntry {
  id: string;
  timestamp: string;
  prediction: string;
  model_score: number;
  is_uncertain: boolean;
  risk_level: string;
}

const STORAGE_KEY = "medtech_history";

function saveToHistory(result: AnalysisResult) {
  if (typeof localStorage === "undefined") return;
  try {
    const existing: HistoryEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      prediction: result.prediction,
      model_score: result.model_score,
      is_uncertain: result.is_uncertain,
      risk_level: result.risk_level,
    };
    const updated = [entry, ...existing].slice(0, 50); // keep last 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage unavailable — fail silently
  }
}

export function useHistory() {
  return { saveToHistory };
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      setHistory(data);
    } catch {
      setHistory([]);
    }
    setLoaded(true);
  }, []);

  const clearHistory = () => {
    if (confirm("Delete all analysis history from this device?")) {
      localStorage.removeItem(STORAGE_KEY);
      setHistory([]);
    }
  };

  const deleteEntry = (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <>
      <TopBar
        title="Analysis History"
        subtitle="Stored on this device only"
        action={
          history.length > 0 ? (
            <button
              onClick={clearHistory}
              className="text-xs text-[var(--color-error)] font-semibold hover:underline"
              aria-label="Clear all history"
            >
              Clear All
            </button>
          ) : undefined
        }
      />

      <main className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Privacy notice */}
        <div className="bg-[var(--color-info-light)] border border-[var(--color-info)] rounded-lg p-3 flex gap-2">
          <span className="material-symbols-outlined text-[var(--color-info)] text-[16px] flex-shrink-0 mt-0.5" aria-hidden="true">lock</span>
          <p className="text-xs text-[var(--color-info)]">
            Analysis results are stored <strong>only on this device</strong> in browser local storage.
            Only summary data (prediction and score) is saved — no images.
            You can delete any record at any time.
          </p>
        </div>

        {!loaded ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-4 space-y-2">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="card p-10 text-center space-y-3">
            <span className="material-symbols-outlined text-[48px] text-[var(--color-on-surface-subtle)]" aria-hidden="true">
              history
            </span>
            <p className="font-semibold text-[var(--color-on-surface-muted)] text-sm">No analysis history yet</p>
            <p className="text-xs text-[var(--color-on-surface-subtle)]">
              Your recent X-ray analyses will appear here after you run your first scan.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-on-surface-subtle)]">
              {history.length} record{history.length !== 1 ? "s" : ""} on this device
            </p>
            {history.map((entry) => {
              const statusColor =
                entry.is_uncertain
                  ? "border-l-[var(--color-uncertain)] bg-[var(--color-uncertain-bg)]"
                  : entry.prediction === "Pneumonia"
                  ? "border-l-[var(--color-pneumonia)] bg-[var(--color-pneumonia-bg)]"
                  : "border-l-[var(--color-normal)] bg-[var(--color-normal-bg)]";
              return (
                <article
                  key={entry.id}
                  className={`card border-l-4 p-3 flex items-center gap-3 ${statusColor}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--color-on-surface)]">
                        {entry.is_uncertain ? "Inconclusive" : entry.prediction}
                      </span>
                      <span className="text-xs text-[var(--color-on-surface-subtle)]">
                        {(entry.model_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--color-on-surface-subtle)] mt-0.5">
                      {formatRelative(entry.timestamp)} · {entry.risk_level}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-error-light)] transition-colors"
                    aria-label={`Delete record from ${formatRelative(entry.timestamp)}`}
                  >
                    <span className="material-symbols-outlined text-[var(--color-error)] text-[18px]" aria-hidden="true">delete</span>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}
