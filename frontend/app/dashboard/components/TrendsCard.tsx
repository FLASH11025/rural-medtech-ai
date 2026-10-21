"use client";
import { useState } from "react";
import type { SeriesBucket } from "@/lib/stats";

const W = 320;
const H = 150;
const ML = 6;
const MR = 6;
const MT = 16;
const MB = 12;

const SERIES = [
  { key: "pneumonia" as const, color: "#fb7185", dashed: false },
  { key: "normal" as const, color: "#c6f432", dashed: false },
  { key: "uncertain" as const, color: "#8a8a93", dashed: true },
];

function buildPath(values: number[], max: number): string {
  const n = values.length;
  const innerW = W - ML - MR;
  const innerH = H - MT - MB;
  return values
    .map((v, i) => {
      const x = n > 1 ? ML + (i * innerW) / (n - 1) : ML + innerW / 2;
      const y = H - MB - (v / max) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrendsCard({ series }: { series: SeriesBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(
    1,
    ...series.map((s) => Math.max(s.normal, s.pneumonia, s.uncertain))
  );
  const isEmpty = series.every((s) => s.normal + s.pneumonia + s.uncertain === 0);
  const innerW = W - ML - MR;
  const innerH = H - MT - MB;

  const n = series.length;
  const xFor = (i: number) => (n > 1 ? ML + (i * innerW) / (n - 1) : ML + innerW / 2);
  const yFor = (v: number) => H - MB - (v / max) * innerH;

  const have = hover !== null && hover >= 0 && hover < n ? hover : null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-ink2">Trends</p>
        <div className="flex items-center gap-3 text-[10px] text-ink2" aria-hidden="true">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={
                  s.dashed
                    ? { border: `1.5px dashed ${s.color}`, width: 8, height: 0 }
                    : { background: s.color, boxShadow: `0 0 6px ${s.color}66` }
                }
              />
              {s.key === "pneumonia" ? "Flagged" : s.key === "normal" ? "Normal" : "Uncertain"}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={
            isEmpty
              ? "No scan data for this period"
              : "Line chart comparing flagged, normal and inconclusive scans over the selected period"
          }
        >
          <defs>
            <linearGradient id="trendsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
            </linearGradient>
          </defs>

          {isEmpty ? (
            <>
              <line
                x1={ML}
                y1={H - MB - innerH / 2}
                x2={W - MR}
                y2={H - MB - innerH / 2}
                stroke="#8a8a93"
                strokeWidth="2"
                strokeDasharray="6 6"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={W / 2}
                y={H / 2 + 16}
                textAnchor="middle"
                fontSize="11"
                fill="#8a8a93"
              >
                No scans in this period.
              </text>
            </>
          ) : (
            <>
              <path
                d={`${buildPath(series.map((s) => s.pneumonia), max)} L${(W - MR).toFixed(1)} ${H - MB} L${ML} ${H - MB} Z`}
                fill="url(#trendsFill)"
              />
              {SERIES.map((s) => (
                <path
                  key={s.key}
                  d={buildPath(series.map((b) => b[s.key]), max)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.key === "pneumonia" ? 2.5 : 2}
                  strokeDasharray={s.dashed ? "4 4" : undefined}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {have !== null && (
                <line
                  x1={xFor(have)}
                  y1={MT - 6}
                  x2={xFor(have)}
                  y2={H - MB}
                  stroke="#ffffff"
                  strokeOpacity="0.25"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </>
          )}
        </svg>

        {/* Hover overlay */}
        {!isEmpty && n > 0 && (
          <div
            className="absolute inset-0 flex"
            onMouseLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
          >
            {series.map((s, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`${s.label}: ${s.pneumonia} flagged, ${s.normal} normal, ${s.uncertain} uncertain`}
                className="dash-focus min-w-0 flex-1"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
              />
            ))}
          </div>
        )}

        {/* Guide dots */}
        {!isEmpty && have !== null && (
          <div className="pointer-events-none absolute inset-0 overflow-visible">
            {SERIES.map((s) => (
              <span
                key={s.key}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black"
                style={{
                  left: `${(xFor(have) / W) * 100}%`,
                  top: `${(yFor(series[have][s.key]) / H) * 100}%`,
                  background: s.color,
                  boxShadow: `0 0 8px ${s.color}`,
                }}
              />
            ))}
            <div
              className="chart-tip"
              style={{
                left: `clamp(0px, calc(${(xFor(have) / W) * 100}% - 60px), calc(100% - 120px))`,
                bottom: "calc(100% + 6px)",
              }}
            >
              <p className="font-bold text-white">{series[have].label}</p>
              <p className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#fb7185" }} />
                <span className="text-white">{series[have].pneumonia} flagged</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#c6f432" }} />
                <span className="text-ink2">{series[have].normal} normal</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#8a8a93" }} />
                <span className="text-ink2">{series[have].uncertain} uncertain</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
