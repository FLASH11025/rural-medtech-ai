"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import {
  BottomNav,
  DisclaimerBanner,
  Skeleton,
  TopBar,
  usePrefersReducedMotion,
} from "../components/ui";
import { useHistory, loadSampleData, clearSampleData, clearHistoryStorage, type HistoryEntry } from "../../lib/history";
import {
  averageProcessingMs,
  changePercent,
  countByPrediction,
  heatmapMatrix,
  periodRange,
  previousPeriodCount,
  seriesForChart,
  triageBreakdown,
  filterByPeriod,
  type Period,
} from "../../lib/stats";
import { healthCheck, getModelStatus } from "../../lib/api";
import type { ModelStatus } from "../../lib/types";
import { OverviewHeader } from "./components/OverviewHeader";
import { SegmentBars } from "./components/SegmentBars";
import { TrendsCard } from "./components/TrendsCard";
import { ActivityHeatmap } from "./components/ActivityHeatmap";
import { RecentScansCard } from "./components/RecentScansCard";
import { SystemHealthCard } from "./components/SystemHealthCard";
import { TriageCard } from "./components/TriageCard";

const d = (ms: number) => ({ "--d": `${ms}ms` } as CSSProperties);

export default function DashboardPage() {
  const { entries, loaded, removeEntry, refresh } = useHistory();
  const reduced = usePrefersReducedMotion();

  const [period, setPeriod] = useState<Period>("week");
  const [now, setNow] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const check = () => {
      healthCheck()
        .then(setOnline)
        .catch(() => setOnline(false));
    };
    const t = setTimeout(check, 0);
    const i = setInterval(check, 15000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);

  useEffect(() => {
    if (online !== true) return; // only fetch model info while engine is up
    const t = setTimeout(() => {
      getModelStatus()
        .then(setModel)
        .catch(() => setModel(null));
    }, 0);
    return () => clearTimeout(t);
  }, [online]);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const o = await healthCheck();
      setOnline(o);
      if (o) {
        try {
          const m = await getModelStatus();
          setModel(m);
        } catch {
          setModel(null);
        }
      }
    } catch {
      setOnline(false);
      setModel(null);
    } finally {
      setChecking(false);
    }
  };

  const ready = loaded && now > 0;

  const filtered = useMemo(
    () => (ready ? filterByPeriod(entries, period, now) : []),
    [entries, period, now, ready]
  );
  const stats = useMemo(() => countByPrediction(filtered), [filtered]);
  const prevCount = useMemo(
    () => (ready ? previousPeriodCount(entries, period, now) : 0),
    [entries, period, now, ready]
  );
  const change = useMemo(() => changePercent(stats.total, prevCount), [stats.total, prevCount]);
  const series = useMemo(() => seriesForChart(filtered, period, now), [filtered, period, now]);
  const heat = useMemo(() => heatmapMatrix(entries, now), [entries, now]);
  const triage = useMemo(() => triageBreakdown(filtered), [filtered]);
  const avgMs = useMemo(() => averageProcessingMs(filtered), [filtered]);
  const range = useMemo(() => periodRange(period, now), [period, now]);
  const hasSamples = useMemo(() => entries.some((e) => e.is_sample), [entries]);

  const handleSampleWarning = () => {
    if (!confirm("Load clearly-labelled sample data? Only available while history is empty.")) return;
    loadSampleData(Date.now());
    refresh();
  };

  const handleClearSamples = () => {
    if (!confirm("Remove all sample data? Real scans are kept.")) return;
    clearSampleData();
    refresh();
  };

  const handleExportCsv = () => {
    const rows: string[][] = [
      ["Timestamp", "Prediction", "Confidence", "Uncertain", "Risk level", "Processing ms", "Sample"],
      ...filtered.map((e: HistoryEntry) => [
        e.timestamp,
        e.prediction,
        String(e.confidence ?? e.model_score),
        String(e.is_uncertain),
        e.risk_level,
        String(e.processing_ms ?? ""),
        String(e.is_sample ?? false),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rural-medtech-summary-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleClearHistory = () => {
    if (!confirm("Clear all scan history? This cannot be undone.")) return;
    clearHistoryStorage();
    refresh();
  };

  return (
    <>
      <TopBar />
      <main className="container-x pb-28 pt-6 md:pb-12">
        {!ready ? (
          <div className="grid gap-4">
            <div className="card p-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="mt-4 h-4 w-48" />
              <div className="mt-8 flex items-end gap-3">
                <Skeleton className="h-14 w-36" />
                <Skeleton className="mb-1 h-6 w-20" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          </div>
        ) : (
          <>
            {/* Overview card */}
            <div className="card overflow-hidden">
              <div className="fade-up" style={d(0)}>
                <OverviewHeader
                  total={stats.total}
                  changePct={change}
                  flagged={stats.flaggedForReview}
                  now={now}
                  period={period}
                  onPeriodChange={(v) => setPeriod(v as Period)}
                  reduced={reduced}
                  onExportCsv={handleExportCsv}
                  onPrint={handlePrint}
                  onClearHistory={handleClearHistory}
                />
              </div>
              <div key={period} className="cross-fade">
                <SegmentBars stats={stats} rangeStart={range.start} rangeEnd={range.end} />
              </div>
            </div>

            {/* Sample-data banner */}
            {hasSamples && (
              <div
                className="fade-up mt-4 flex items-center gap-2.5 rounded-2xl border px-4 py-3"
                style={{ background: "rgba(251,191,36,0.07)", borderColor: "rgba(251,191,36,0.22)" }}
                style-role={undefined}
              >
                <TriangleAlert size={15} style={{ color: "var(--amber)" }} aria-hidden="true" className="flex-shrink-0" />
                <p className="text-xs leading-snug text-ink2">
                  <span style={{ color: "var(--amber)" }} className="font-semibold">
                    Sample data loaded.
                  </span>{" "}
                  Historic entries are generated for demo purposes — clear them before real use.
                </p>
                <button
                  type="button"
                  onClick={handleClearSamples}
                  className="ml-auto flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-amber transition-colors hover:bg-amber/10"
                >
                  Clear sample data
                </button>
              </div>
            )}
            {!hasSamples && stats.total === 0 && prevCount === 0 && entries.length === 0 && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleSampleWarning}
                  className="chip chip-ink pressable text-xs"
                >
                  Load sample data
                </button>
              </div>
            )}

            {/* First widget row */}
            <div key={`row1-${period}`} className="cross-fade mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="fade-up" style={d(60)}>
                <TrendsCard series={series} />
              </div>
              <div className="fade-up" style={d(120)}>
                <ActivityHeatmap matrix={heat.matrix} />
              </div>
              <div className="fade-up" style={d(180)}>
                <RecentScansCard
                  entries={filtered}
                  now={now}
                  onDelete={removeEntry}
                />
              </div>
            </div>

            {/* Second widget row */}
            <div key={`row2-${period}`} className="cross-fade mt-4 grid gap-4 lg:grid-cols-2">
              <div className="fade-up" style={d(240)}>
                <SystemHealthCard
                  online={online}
                  model={model}
                  avgMs={avgMs}
                  checking={checking}
                  onRecheck={handleRecheck}
                />
              </div>
              <div className="fade-up" style={d(300)}>
                <TriageCard triage={triage} />
              </div>
            </div>

            {/* Stat-specific disclaimer */}
            <div className="fade-up mt-6" style={d(360)}>
              <DisclaimerBanner />
              <p className="mt-2 text-center text-[11px] text-ink3">
                Statistics summarize screening-aid outputs only. Not diagnoses.
              </p>
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
