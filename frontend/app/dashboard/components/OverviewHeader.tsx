"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { MapPin, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { Menu } from "./Menu";
import { SegmentedControl, useCountUp } from "../../components/ui";

const CLINIC_KEY = "rma_clinic_name";

function EditableClinicName() {
  const [name, setName] = useState("Clinic");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const v = localStorage.getItem(CLINIC_KEY);
        if (v) setName(v);
      } catch {
        // storage unavailable
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <input
      value={name}
      style={{ width: `${Math.max(8, name.length + 2)}ch` }}
      onChange={(e) => {
        const v = e.target.value;
        setName(v);
        try {
          localStorage.setItem(CLINIC_KEY, v);
        } catch {
          // storage unavailable
        }
      }}
      aria-label="Clinic name"
      className="clinic-edit font-bold"
    />
  );
}

export function OverviewHeader({
  total,
  changePct,
  flagged,
  now,
  period,
  onPeriodChange,
  reduced,
  onExportCsv,
  onPrint,
  onClearHistory,
}: {
  total: number;
  changePct: number | null;
  flagged: number;
  now: number;
  period: string;
  onPeriodChange: (v: string) => void;
  reduced: boolean;
  onExportCsv: () => void;
  onPrint: () => void;
  onClearHistory: () => void;
}) {
  const h = now ? new Date(now).getHours() : 10;
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const counted = useCountUp(total, reduced);

  const chipStyle: CSSProperties = {
    background: "rgba(34,211,238,0.12)",
    borderColor: "rgba(34,211,238,0.25)",
    color: "#67e8f9",
  };

  return (
    <section className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {greeting},{" "}
            <EditableClinicName />
          </h1>
          <p className="mt-2 text-sm text-ink2">
            Here&apos;s what your clinic scanned over the last {period}.
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <Link href="/" className="btn btn-white pressable">
            <Plus size={15} aria-hidden="true" />
            New scan
          </Link>
          <Link href="/hospitals" className="btn btn-dark pressable">
            <MapPin size={15} aria-hidden="true" />
            Find hospital
          </Link>
          <Menu
            label="Dashboard actions"
            actions={[
              { label: "Export CSV summary", onSelect: onExportCsv },
              { label: "Print report", onSelect: onPrint },
              { label: "Clear history", onSelect: onClearHistory, danger: true },
            ]}
          />
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div className="stagger flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink2">Total scans</p>
            <p className="tnum mt-1 text-5xl font-bold tracking-tight text-white">
              {Math.round(counted)}
            </p>
          </div>
          {changePct !== null && (
            <span
              className="chip h-7 gap-1 px-2.5 text-xs font-semibold"
              style={chipStyle}
              aria-label={`${Math.abs(changePct)}% ${changePct >= 0 ? "more" : "fewer"} scans than the previous ${period}`}
            >
              {changePct >= 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
              {changePct >= 0 ? "+" : ""}
              {changePct}%
            </span>
          )}
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink2">
            <span aria-hidden="true" className="text-ink3">•</span>
            {flagged} flagged for review this {period}
          </p>
        </div>

        <SegmentedControl
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "year", label: "Year" },
          ]}
          value={period}
          onChange={onPeriodChange}
          ariaLabel="Time range"
        />
      </div>
    </section>
  );
}
