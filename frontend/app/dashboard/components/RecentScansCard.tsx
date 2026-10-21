"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HistoryEntry } from "@/lib/history";
import { Menu } from "./Menu";
import { StatusBadge } from "../../components/ui";

function formatRelative(ts: string, now: number): string {
  const t = new Date(ts).getTime();
  const diff = now - t;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} min ago`;
  }
  if (diff < 172_800_000) {
    const h = Math.floor(diff / 3_600_000);
    return h === 1 ? "1 hr ago" : `${h} hrs ago`;
  }
  if (diff < 7 * 86_400_000) {
    const d = Math.floor(diff / 86_400_000);
    return d === 1 ? "Yesterday" : `${d} days ago`;
  }
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function badgeFor(e: HistoryEntry): "pneumonia" | "normal" | "uncertain" {
  if (e.is_uncertain) return "uncertain";
  return e.prediction === "Pneumonia" ? "pneumonia" : "normal";
}

function riskFor(e: HistoryEntry): { label: string; chip: string; pct: number } {
  const conf = Math.max(e.model_score, 1 - e.model_score);
  const pct = Math.round((e.confidence ?? conf) * 100);
  const r = e.risk_level.toLowerCase();
  if (r.includes("high")) return { label: "HIGH", chip: "chip-pneumonia", pct };
  if (r.includes("moderate")) return { label: "MED", chip: "chip-uncertain", pct };
  if (e.is_uncertain) return { label: "REVIEW", chip: "chip-uncertain", pct };
  return { label: "LOW", chip: "chip-normal", pct };
}

export function RecentScansCard({
  entries,
  now,
  onDelete,
}: {
  entries: HistoryEntry[];
  now: number;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const rows = entries.slice(0, 5);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-ink2">Recent scans</p>
        <Link href="/history" className="text-[11px] font-semibold text-ink2 transition-colors hover:text-white">
          View all
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center gap-3 py-10 text-center">
          <p className="text-xs text-ink3">Results appear here after each analysis.</p>
          <Link href="/" className="btn btn-lime">
            Start a scan
          </Link>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-white/5">
          {rows.map((e) => {
            const risk = riskFor(e);
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {formatRelative(e.timestamp, now)}
                    {e.is_sample && (
                      <span className="chip chip-uncertain ml-2 !h-5 !px-1.5 align-middle text-[9px]">
                        Sample
                      </span>
                    )}
                  </p>
                  <div className="mt-1">
                    <StatusBadge status={badgeFor(e)} />
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <span className={`chip ${risk.chip} !h-6 text-[10px]`}>
                    {risk.label}
                    <span className="tnum font-bold">· {risk.pct}%</span>
                  </span>
                  <Menu
                    label={`Actions for scan at ${e.timestamp}`}
                    actions={[
                      {
                        label: "View details",
                        onSelect: () => {
                          router.push("/history");
                        },
                      },
                      { label: "Delete", onSelect: () => onDelete(e.id), danger: true },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
