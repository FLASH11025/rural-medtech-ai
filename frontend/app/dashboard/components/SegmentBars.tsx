"use client";
import { useEffect, useState } from "react";
import type { PredictionCounts } from "@/lib/stats";

const STRIPES = 28;

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function SegmentBars({
  stats,
  rangeStart,
  rangeEnd,
}: {
  stats: PredictionCounts;
  rangeStart: number;
  rangeEnd: number;
}) {
  const [grow, setGrow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrow(true), 80);
    return () => clearTimeout(t);
  }, []);

  const total = Math.max(1, stats.total);
  const pct = (n: number) => Math.round((n / total) * 100);
  const normalPct = pct(stats.normal);
  const pneumoniaPct = pct(stats.pneumonia);
  const uncertainPct = pct(stats.uncertain);
  const pneumoniaFilled = Math.max(
    stats.pneumonia > 0 ? 1 : 0,
    Math.min(STRIPES, Math.round((stats.pneumonia / total) * STRIPES))
  );
  const uncertainFilled = Math.max(
    stats.uncertain > 0 ? 1 : 0,
    Math.min(STRIPES, Math.round((stats.uncertain / total) * STRIPES))
  );
  const daySpan = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000));
  const avg = stats.total / daySpan;

  return (
    <div className="seg-strip border-t border-white/6">
      {/* Normal */}
      <div className="seg-cell">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink2">Normal</p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="tnum text-4xl font-bold tracking-tight text-white">{stats.normal}</span>
          <span className="mb-1 flex items-center gap-1.5 text-xs text-ink2">
            <span className="dot" style={{ background: "var(--green)" }} aria-hidden="true" />
            {normalPct}%
          </span>
        </div>
        <div className="solid-bar mt-3">
          <span style={{ width: grow ? `${normalPct}%` : "0%" }} />
        </div>
      </div>

      {/* Pneumonia flagged */}
      <div className="seg-cell">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink2">Pneumonia flagged</p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="tnum text-4xl font-bold tracking-tight text-white">{stats.pneumonia}</span>
          <span className="mb-1 flex items-center gap-1.5 text-xs text-ink2">
            <span className="dot" style={{ background: "var(--coral)" }} aria-hidden="true" />
            {pneumoniaPct}%
          </span>
        </div>
        <div className="stripe-row mt-3" role="img" aria-label={`${pneumoniaPct}% of scans flagged for pneumonia`}>
          {Array.from({ length: STRIPES }, (_, i) => (
            <span
              key={i}
              className={`stripe ${i < pneumoniaFilled ? "filled-violet" : ""} ${grow ? "on" : ""}`}
              style={{ transitionDelay: `${i * 14}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Uncertain — cropped at right edge */}
      <div className="seg-cell relative overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink2">Uncertain</p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="tnum text-4xl font-bold tracking-tight text-white">{stats.uncertain}</span>
          <span className="mb-1 flex items-center gap-1.5 text-xs text-ink2">
            <span className="dot" style={{ background: "var(--amber)" }} aria-hidden="true" />
            {uncertainPct}%
          </span>
        </div>
        <div className="stripe-row mt-3 w-[110%]" role="img" aria-label={`${uncertainPct}% of scans inconclusive`}>
          {Array.from({ length: STRIPES + 4 }, (_, i) => (
            <span
              key={i}
              className={`stripe ${i < uncertainFilled ? "filled-dim" : ""} ${grow ? "on" : ""}`}
              style={{ transitionDelay: `${i * 12}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Average line + date range */}
      <div className="col-span-full flex items-center gap-3 px-5 pb-4 pt-1 sm:px-6">
        <div className="avg-line relative flex-1">
          <span className="avg-pill chip chip-ink text-[10px]">Avg / day · {avg.toFixed(1)}</span>
        </div>
        <span className="flex-shrink-0 text-xs text-ink3">
          {fmtDate(rangeStart)} – {fmtDate(rangeEnd)}
        </span>
      </div>
    </div>
  );
}
