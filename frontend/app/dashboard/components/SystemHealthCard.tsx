"use client";
import { RefreshCw, ShieldCheck } from "lucide-react";
import type { ModelStatus } from "@/lib/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-xs text-ink2">{label}</dt>
      <dd className="truncate text-xs font-medium text-white">{value}</dd>
    </div>
  );
}

export function SystemHealthCard({
  online,
  model,
  avgMs,
  checking,
  onRecheck,
}: {
  online: boolean | null;
  model: ModelStatus | null;
  avgMs: number | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-ink2">System health</p>
        <button
          type="button"
          onClick={onRecheck}
          className="icon-btn pressable"
          aria-label="Re-check engine status"
          disabled={checking}
        >
          <RefreshCw size={15} aria-hidden="true" className={checking ? "spin" : ""} />
        </button>
      </div>

      {online === false && (
        <div
          className="mt-3 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5"
          style={{ background: "rgba(251,191,36,0.07)", borderColor: "rgba(251,191,36,0.22)" }}
          role="alert"
        >
          <p className="text-xs leading-snug text-amber">
            <strong>Engine offline.</strong> Start the backend with{" "}
            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] text-white">
              npm run dev:all
            </code>
          </p>
        </div>
      )}

      <dl className="mt-3 divide-y divide-white/5">
        <Row label="Diagnostic engine" value={online === null ? "Checking…" : online ? "Running" : "Offline"} />
        <Row
          label="Model loaded"
          value={model ? (model.model_loaded ? "Loaded" : "Missing") : online === false ? "—" : "…"}
        />
        <Row label="Architecture" value={model?.architecture ?? "—"} />
        <Row label="Classes" value={model?.classes.join(" / ") ?? "—"} />
        <Row label="Torch version" value={model?.torch_version ?? "—"} />
        <Row
          label="Avg inference time"
          value={avgMs !== null ? `${avgMs} ms local` : "—"}
        />
      </dl>

      <div className="mt-4 border-t border-white/5 pt-3">
        <span className="chip chip-ink text-[10px]">
          <ShieldCheck size={12} aria-hidden="true" />
          No data leaves this device
        </span>
      </div>
    </div>
  );
}
