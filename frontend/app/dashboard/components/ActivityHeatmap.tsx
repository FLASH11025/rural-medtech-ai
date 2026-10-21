"use client";
import { useState } from "react";
import { DAY_LABELS, HOUR_BLOCKS } from "@/lib/stats";

const HEAT = ["#2a1b4d", "#3d2677", "#5b34b0", "#7c4ddb", "#a98bf0", "#cdb8fa"];

function hourRange(rowIdx: number): string {
  const b = HOUR_BLOCKS[rowIdx];
  const endHour = b.startHour + 2;
  const fmt = (h: number) => (h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);
  return `${fmt(b.startHour)}–${fmt(endHour)}`;
}

export function ActivityHeatmap({ matrix }: { matrix: number[][] }) {
  const [cell, setCell] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  let max = 1;
  for (const row of matrix) for (const v of row) if (v > max) max = v;

  const rows = matrix.length; // hour blocks
  const cols = rows > 0 ? matrix[0].length : 7; // weekdays

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-ink2">Activity heatmap</p>
        <span className="text-[10px] text-ink3">Last 12 months</span>
      </div>

      <div className="relative mt-4">
        <div className="grid grid-cols-[28px_repeat(7,minmax(0,1fr))] gap-x-1.5 gap-y-1.5">
          <span />
          {DAY_LABELS.map((d) => (
            <span key={d} className="text-center text-[9px] font-semibold uppercase tracking-wide text-ink3">
              {d}
            </span>
          ))}
          {Array.from({ length: rows }, (_, r) => (
            <HeatRow key={r} r={r} row={matrix[r]} cols={cols} max={max} onCell={setCell} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-ink3">Less</span>
        {HEAT.map((c) => (
          <span
            key={c}
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-[4px]"
            style={{ background: c }}
          />
        ))}
        <span className="text-[10px] text-ink3">More</span>
      </div>

      {cell && (
        <div
          className="chart-tip"
          style={{
            left: `clamp(0px, calc(${cell.x * 100}% - 50px), calc(100% - 110px))`,
            bottom: "100%",
          }}
        >
          <p className="font-bold text-white">
            {dayName(cell.c)} · {hourRange(cell.r)}
          </p>
          <p className="text-ink2">Scans in window: {matrix[cell.r][cell.c]}</p>
        </div>
      )}
    </div>
  );
}

function dayName(c: number): string {
  return DAY_LABELS[c] ?? "—";
}

function HeatRow({
  r,
  row,
  cols,
  max,
  onCell,
}: {
  r: number;
  row: number[];
  cols: number;
  max: number;
  onCell: (c: { r: number; c: number; x: number; y: number } | null) => void;
}) {
  return (
    <>
      <span className="pr-0.5 text-right text-[9px] font-semibold leading-none text-ink3" style={{ lineHeight: "34px" }}>
        {HOUR_BLOCKS[r].label}
      </span>
      {Array.from({ length: cols }, (_, c) => {
        const v = row[c] ?? 0;
        const level = v === 0 ? -1 : Math.min(5, 1 + Math.floor(((v - 1) / max) * 4.999));
        const dark = level >= 4;
        const label = `${HOUR_BLOCKS[r].label} ${
          DAY_LABELS[c] ?? ""
        }: ${v} ${v === 1 ? "scan" : "scans"}`;
        if (v === 0) {
          return (
            <span
              key={c}
              className="hm-cell hm-empty"
              title={`${label} · 0 scans`}
              aria-hidden="true"
            />
          );
        }
        return (
          <button
            key={c}
            type="button"
            className="hm-cell dash-focus tnum"
            style={{
              background: HEAT[level],
              color: dark ? "#1a1033" : "#e9e4ff",
            }}
            title={`${label}`}
            aria-label={label}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const parent = e.currentTarget.closest(".card");
              const pr = parent?.getBoundingClientRect();
              onCell({
                r,
                c,
                x: pr ? (rect.left + rect.width / 2 - pr.left) : 0,
                y: r,
              });
            }}
            onFocus={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const parent = e.currentTarget.closest(".card");
              const pr = parent?.getBoundingClientRect();
              onCell({
                r,
                c,
                x: pr ? (rect.left + rect.width / 2 - pr.left) : 0,
                y: r,
              });
            }}
            onMouseLeave={() => onCell(null)}
            onBlur={() => onCell(null)}
          >
            <span className="grid h-full w-full place-items-center text-[10px] font-bold">{v}</span>
          </button>
        );
      })}
    </>
  );
}
