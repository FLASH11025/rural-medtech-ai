"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { TriageBreakdown } from "@/lib/stats";

export function TriageCard({ triage }: { triage: TriageBreakdown }) {
  const total = Math.max(1, triage.total);
  const pct = (n: number) => (n / total) * 100;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-ink2">Triage distribution</p>
        <span className="tnum text-xs text-ink3">{triage.total} total</span>
      </div>

      {/* Stacked triage bar */}
      <div
        className="mt-4 flex h-[26px] w-full gap-0.5 overflow-hidden rounded-full bg-[#2a1b4d]"
        role="img"
        aria-label={`Triage distribution: ${triage.low} low, ${triage.moderate} moderate, ${triage.high} high priority`}
      >
        {triage.low > 0 && (
          <span
            className="h-full rounded-full"
            style={{
              width: `${Math.max(pct(triage.low), 5)}%`,
              background: "rgba(255,255,255,0.18)",
            }}
          />
        )}
        {triage.moderate > 0 && (
          <span
            className="h-full rounded-full"
            style={{
              width: `${Math.max(pct(triage.moderate), 5)}%`,
              background: "var(--amber)",
            }}
          />
        )}
        {triage.high > 0 && (
          <span
            className="h-full rounded-full"
            style={{
              width: `${Math.max(pct(triage.high), 5)}%`,
              background: "var(--coral)",
            }}
          />
        )}
      </div>

      <ul className="mt-4 space-y-2.5">
        {[
          { key: "High", count: triage.high, color: "var(--coral)" },
          { key: "Moderate", count: triage.moderate, color: "var(--amber)" },
          { key: "Low", count: triage.low, color: "rgba(255,255,255,0.35)" },
        ].map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-ink2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: row.color }}
                aria-hidden="true"
              />
              {row.key}
            </span>
            <span className="tnum font-semibold text-white">{row.count}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-snug text-ink3">
        High-priority cases should be referred first.
      </p>

      <Link
        href="/hospitals"
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-lime transition-opacity hover:opacity-80"
      >
        Find nearby hospitals
        <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}
