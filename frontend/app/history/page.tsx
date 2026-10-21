"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  EllipsisVertical,
  History,
  Trash,
} from "lucide-react";
import {
  clearHistoryStorage,
  deleteHistoryEntry,
  readHistory,
  type HistoryEntry,
} from "../../lib/history";
import {
  BottomNav,
  DisclaimerBanner,
  IconButton,
  PillButton,
  Skeleton,
  StatusBadge,
  TopBar,
} from "../components/ui";

function formatRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function statusFor(entry: HistoryEntry): "pneumonia" | "normal" | "uncertain" {
  if (entry.is_uncertain) return "uncertain";
  return entry.prediction === "Pneumonia" ? "pneumonia" : "normal";
}

function riskChip(risk: string): string {
  const r = risk.toLowerCase();
  if (r.includes("high")) return "chip-pneumonia";
  if (r.includes("moderate")) return "chip-uncertain";
  return "chip-normal";
}

/** 7-day mini line chart — skipped if there is not enough data */
function Sparkline({ data }: { data: number[] }) {
  const total = data.reduce((a, b) => a + b, 0);
  if (total < 2) return null;

  const w = 280;
  const h = 56;
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data.map((v, i) => [i * step, h - (v / max) * (h - 8) - 4] as const);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-14 w-full"
      role="img"
      aria-label={`Scans per day over the last 7 days, peak ${max} per day`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setHistory(readHistory());
      setNow(Date.now());
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const total = history.length;
  const flagged = history.filter((h) => h.prediction === "Pneumonia" && !h.is_uncertain).length;
  const normal = history.filter((h) => h.prediction === "Normal" && !h.is_uncertain).length;
  const uncertain = history.filter((h) => h.is_uncertain).length;

  const last7 = history.filter((h) => now - new Date(h.timestamp).getTime() < 7 * 864e5);
  const dayCounts = Array.from({ length: 7 })
    .map((_, i) => {
      const start = now - i * 864e5;
      return last7.filter((h) => {
        const t = new Date(h.timestamp).getTime();
        return t > start - 864e5 && t <= start;
      }).length;
    })
    .reverse();

  const clearHistory = () => {
    if (confirm("Delete all analysis history from this device?")) {
      clearHistoryStorage();
      setHistory([]);
    }
  };

  const removeEntry = (id: string) => {
    setHistory(deleteHistoryEntry(id));
  };

  return (
    <>
      <TopBar />

      <main className="container-x pb-28 pt-6 md:pb-12">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-medium leading-tight tracking-tight md:text-[40px]">
              Scan <span className="text-ink2">history</span>
            </h1>
            <p className="mt-1 text-sm text-ink2">Stored only on this device — summaries only, never images.</p>
          </div>
        </div>

        {!loaded ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-3xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-3xl" />
          </div>
        ) : total === 0 ? (
          <div className="card grid place-items-center gap-3 p-12 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-white/8" style={{ background: "rgba(124,58,237,0.14)" }}>
              <History size={26} style={{ color: "var(--violetlight)" }} aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-white">No scans yet</p>
            <p className="max-w-xs text-xs leading-snug text-ink3">
              Your screening summaries will appear here after your first analysis. Nothing leaves this device.
            </p>
            <Link href="/" className="btn btn-lime" aria-label="Start a scan">
              Start a scan
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="stagger space-y-4">
            {/* Stat row */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile value={total} label="Total scans" color="var(--violetlight)" />
              <StatTile value={flagged} label="Pneumonia flagged" color="var(--coral)" />
              <StatTile value={normal} label="Normal" color="var(--green)" />
              <StatTile value={uncertain} label="Uncertain" color="var(--amber)" />
            </div>

            {/* Sparkline card */}
            <div className="card p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Last 7 days</h3>
                <span className="chip chip-ink">
                  <Clock size={12} aria-hidden="true" />
                  {last7.length} scans
                </span>
              </div>
              <Sparkline data={dayCounts} />
              {last7.length < 2 && (
                <p className="text-xs text-ink3">Run at least 2 more scans to see the trend.</p>
              )}
            </div>

            {/* Recent scans */}
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Recent scans</h3>
                <PillButton variant="ghost" className="!h-9 !text-xs" onClick={clearHistory}>
                  <Trash size={13} aria-hidden="true" />
                  Clear all
                </PillButton>
              </div>
              <ul className="divide-y divide-white/4">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink3">{formatRelative(entry.timestamp, now)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={statusFor(entry)} />
                        <span className={`chip ${riskChip(entry.risk_level)} !text-[10px]`}>{entry.risk_level}</span>
                      </div>
                    </div>
                    <span className="tnum text-sm font-semibold text-white" aria-label={`Model score ${(entry.model_score * 100).toFixed(0)} percent`}>
                      {(entry.model_score * 100).toFixed(0)}%
                    </span>
                    <IconButton
                      label={`Delete record from ${formatRelative(entry.timestamp, now)}`}
                      onClick={() => removeEntry(entry.id)}
                      className="!h-9 !w-9"
                    >
                      <EllipsisVertical size={16} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>

            <DisclaimerBanner />
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}

function StatTile({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="card p-4 md:p-5">
      <span className="dot mb-2 inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      <p className="tnum text-[34px] font-medium leading-none tracking-tight md:text-[44px]">{value}</p>
      <p className="mt-1.5 text-[11px] text-ink2">{label}</p>
    </div>
  );
}
