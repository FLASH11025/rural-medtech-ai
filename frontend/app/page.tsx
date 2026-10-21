"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Camera,
  Check,
  CircleAlert,
  Download,
  Info,
  LoaderCircle,
  MapPin,
  Printer,
  RotateCcw,
  ScanLine,
  Sparkles,
  Stethoscope,
  Upload,
  X,
} from "lucide-react";
import { analyzeXRay, healthCheck } from "../lib/api";
import type { AnalysisResult } from "../lib/types";
import { saveToHistory } from "../lib/history";
import {
  BottomNav,
  DisclaimerBanner,
  EngineOfflineBanner,
  IconButton,
  PillButton,
  SegmentedControl,
  StatChip,
  StatusBadge,
  TopBar,
  useCountUp,
  usePrefersReducedMotion,
} from "./components/ui";

type Stage = "idle" | "selected" | "processing" | "result" | "error";

const PROCESSING_STEPS = [
  { id: "validate", label: "Validate" },
  { id: "preprocess", label: "CLAHE preprocessing" },
  { id: "inference", label: "DenseNet-121 inference" },
  { id: "gradcam", label: "Grad-CAM" },
];

const STRIPES = 28;

type ViewMode = "side" | "overlay" | "heat";

const STATUS_COLOR: Record<"pneumonia" | "normal" | "uncertain", string> = {
  pneumonia: "var(--coral)",
  normal: "var(--green)",
  uncertain: "var(--amber)",
};

function XrayPanel({ src, alt, tag }: { src: string | null; alt: string; tag: string }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/6 bg-black">
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full w-full place-items-center p-4 text-center text-xs text-ink3">
          Heatmap unavailable
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white">
        {tag}
      </span>
    </div>
  );
}

export default function ScanPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [inlineError, setInlineError] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState<ViewMode>("side");
  const [split, setSplit] = useState(50);
  const [grown, setGrown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    healthCheck().then(setBackendOnline);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 120);
    return () => clearTimeout(t);
  }, [result]);

  const handleFileSelected = useCallback(
    (file: File) => {
      setInlineError("");
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(file.type) && !file.name.endsWith(".dcm")) {
        setInlineError("Unsupported file — upload a JPEG, PNG, WebP or DICOM chest X-ray.");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setInlineError("File too large (max 15 MB). Please compress and retry.");
        return;
      }
      setSelectedFile(file);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      setResult(null);
      setErrorMessage("");
      setStage("selected");
    },
    []
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelected(file);
    },
    [handleFileSelected]
  );

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setStage("processing");
    setProcessingStep(0);
    setGrown(false);
    setSplit(50);
    startRef.current = Date.now();

    const stepTimer = setInterval(() => {
      setProcessingStep((s) => (s < PROCESSING_STEPS.length - 1 ? s + 1 : s));
    }, 800);

    try {
      const data = await analyzeXRay(selectedFile);
      clearInterval(stepTimer);
      setProcessingStep(PROCESSING_STEPS.length);
      setElapsed((Date.now() - startRef.current) / 1000);
      setResult(data);
      saveToHistory(data, {
        processing_ms: Math.max(0, Date.now() - startRef.current),
        confidence: Math.max(data.model_score, 1 - data.model_score),
      });
      setStage("result");
    } catch (err: unknown) {
      clearInterval(stepTimer);
      setElapsed((Date.now() - startRef.current) / 1000);
      setErrorMessage(
        err instanceof Error ? err.message : "Analysis failed. Is the diagnostic engine running?"
      );
      setStage("error");
    }
  };

  const handleReset = () => {
    setStage("idle");
    setSelectedFile(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setResult(null);
    setErrorMessage("");
    setInlineError("");
    setProcessingStep(0);
    setSplit(50);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const handleSave = () => {
    if (!result) return;
    const report = {
      timestamp: new Date().toISOString(),
      prediction: result.prediction,
      model_score: result.model_score,
      is_uncertain: result.is_uncertain,
      risk_level: result.risk_level,
      disclaimer:
        "This is an AI screening result only. Not a medical diagnosis. Requires professional review.",
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xray-analysis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derive display state
  const status: "pneumonia" | "normal" | "uncertain" = !result
    ? "uncertain"
    : result.is_uncertain
    ? "uncertain"
    : result.prediction === "Pneumonia"
    ? "pneumonia"
    : "normal";

  const predictStatus = () => {
    if (result?.is_uncertain) {
      return (
        <>
          Inconclusive <span style={{ color: "var(--amber)" }}>result</span>
        </>
      );
    }
    if (result?.prediction === "Pneumonia") {
      return (
        <>
          Pneumonia <span style={{ color: "var(--coral)" }}>suspected</span>
        </>
      );
    }
    return (
      <>
        No pneumonia <span style={{ color: "var(--green)" }}>detected</span>
      </>
    );
  };

  const riskChip =
    result?.risk_level.toLowerCase().includes("high")
      ? "chip-pneumonia"
      : result?.risk_level.toLowerCase().includes("moderate")
      ? "chip-uncertain"
      : "chip-normal";

  const statusColor = STATUS_COLOR[status];
  const originalSrc = result?.original_base64 ?? previewUrl;
  const heatSrc = result?.heatmap_base64 ?? null;

  const score = useCountUp(result ? result.model_score * 100 : 0, reduced);
  const whole = Math.floor(score);
  const decimal = Math.floor((score - whole) * 10);
  const filledStripes = result ? Math.round(result.model_score * STRIPES) : 0;

  return (
    <>
      <TopBar />

      <main className={`container-x pb-28 pt-6 md:pb-12 ${result || stage === "processing" ? "" : ""}`}>
        {/* ===== HEADER ===== */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-medium leading-tight tracking-tight md:text-[40px]">
              Chest X-ray <span className="text-ink2">screening</span>
            </h1>
            <p className="mt-1 text-sm text-ink2">
              Runs fully offline on this device. No images leave your clinic.
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <StatChip label="CLAHE" />
            <StatChip label="DenseNet-121" />
            <StatChip label="Grad-CAM" />
          </div>
        </div>

        {backendOnline === false && (
          <div className="mb-4">
            <EngineOfflineBanner />
          </div>
        )}

        {/* ================= STAGGERED CONTENT ================= */}
        <div className="stagger space-y-4">
          {/* ====== IDLE / SELECTED ====== */}
          {(stage === "idle" || stage === "selected" || stage === "processing") && (
            <>
              {/* Upload zone / preview */}
              {stage === "idle" ? (
                <div
                  className={`upload-zone px-6 py-10 text-center ${dragOver ? "drag-over" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload chest X-ray image"
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.dcm"
                    onChange={handleFileInputChange}
                    className="hidden"
                    aria-label="Choose X-ray file"
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileInputChange}
                    className="hidden"
                    aria-label="Capture X-ray with camera"
                  />

                  <div className="glow-orb" aria-hidden="true" />
                  <div className="relative mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-white/10" style={{ background: "rgba(124,58,237,0.15)" }}>
                    <ScanLine size={28} style={{ color: "var(--violetlight)" }} aria-hidden="true" />
                  </div>

                  <p className="text-lg font-semibold text-white">Drop a chest X-ray here</p>
                  <p className="mt-1 text-xs text-ink2">JPEG, PNG, WebP or DICOM · up to 15 MB</p>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                    <PillButton
                      variant="white"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload size={15} aria-hidden="true" />
                      Choose file
                    </PillButton>
                    <PillButton
                      variant="dark"
                      className="md:hidden"
                      onClick={(e) => {
                        e.stopPropagation();
                        cameraInputRef.current?.click();
                      }}
                    >
                      <Camera size={15} aria-hidden="true" />
                      Use camera
                    </PillButton>
                  </div>

                  {inlineError && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs" style={{ background: "rgba(248,113,113,0.1)", borderColor: "rgba(248,113,113,0.35)", color: "var(--rederr)" }}>
                      <CircleAlert size={13} aria-hidden="true" />
                      {inlineError}
                    </div>
                  )}
                </div>
              ) : (
                /* SELECTED / PROCESSING: two-column preview */
                <div className="card p-4 md:p-5">
                  <div className="grid items-center gap-4 sm:grid-cols-[220px_1fr] md:grid-cols-[260px_1fr]">
                    <div className="scan-frame aspect-square">
                      {previewUrl && (
                        <img src={previewUrl} alt="Selected chest X-ray preview" className="h-full w-full object-contain" />
                      )}
                      {stage === "processing" && <div className="scan-line" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{selectedFile?.name}</p>
                          <p className="mt-0.5 text-xs text-ink2">
                            {selectedFile ? `${(selectedFile.size / 1024).toFixed(0)} KB · ${selectedFile.type || "image/dcm"}` : ""}
                          </p>
                        </div>
                        {stage === "selected" && (
                          <IconButton label="Remove file" onClick={handleReset}>
                            <X size={16} />
                          </IconButton>
                        )}
                      </div>
                      {stage === "selected" && (
                        <PillButton
                          variant="lime"
                          className="w-full sm:w-auto"
                          onClick={handleAnalyze}
                          disabled={!selectedFile || backendOnline === false}
                          aria-label="Start X-ray analysis"
                        >
                          <Sparkles size={15} aria-hidden="true" />
                          Analyze X-ray
                        </PillButton>
                      )}
                    </div>
                  </div>

                  {/* Stepper (processing only) */}
                  {stage === "processing" && (
                    <div className="mt-5 border-t border-white/5 pt-5" role="status" aria-live="polite" aria-label="Processing steps">
                      <div className="space-y-3">
                        {PROCESSING_STEPS.map((step, i) => {
                          const done = i < processingStep;
                          const active = i === processingStep;
                          return (
                            <div key={step.id} className="flex items-center gap-3">
                              <span
                                className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border ${
                                  done
                                    ? "border-transparent"
                                    : active
                                    ? "border-transparent"
                                    : "border-white/10 text-ink3"
                                }`}
                                style={
                                  done
                                    ? { background: "rgba(198,244,50,0.12)" }
                                    : active
                                    ? { background: "rgba(124,58,237,0.18)" }
                                    : undefined
                                }
                              >
                                {done ? (
                                  <Check size={14} style={{ color: "var(--lime)" }} aria-hidden="true" />
                                ) : active ? (
                                  <LoaderCircle size={14} className="spin" style={{ color: "var(--violetlight)" }} aria-hidden="true" />
                                ) : (
                                  <span className="text-[10px] font-bold">{i + 1}</span>
                                )}
                              </span>
                              <span
                                className={`text-sm ${
                                  done ? "text-ink2" : active ? "font-semibold text-white" : "text-ink3"
                                }`}
                              >
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {stage === "idle" && <PrivacyNote />}
              {(stage === "idle" || stage === "selected") && <DisclaimerBanner />}
            </>
          )}

          {/* ====== RESULT ====== */}
          {stage === "result" && result && (
            <div id="print-report" className="space-y-4">
              {/* Top strip */}
              <div role="status" aria-live="polite" className="flex flex-wrap items-start justify-between gap-4 px-1 pt-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink3">Screening result</p>
                  <h2 className="mt-1 text-[28px] font-medium leading-[1.08] tracking-tight md:text-[46px]">
                    {predictStatus()}
                  </h2>
                  <StatusBadge
                    status={status}
                    className="mt-3"
                  />
                </div>
                <span className={`chip ${riskChip} !h-9 !px-4 !text-xs`} aria-label={`Triage priority: ${result.risk_level}`}>
                  <span className="dot" style={{ background: "currentColor" }} />
                  {result.risk_level}
                </span>
              </div>

              {/* Uncertainty banner */}
              {result.is_uncertain && (
                <div
                  className="flex items-start gap-2.5 rounded-2xl border px-4 py-3"
                  style={{ background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.25)" }}
                  role="alert"
                >
                  <CircleAlert size={15} style={{ color: "var(--amber)" }} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <p className="text-xs leading-snug" style={{ color: "var(--amber)" }}>
                    <strong>Low confidence result.</strong> Please repeat the scan or seek clinical review — do not
                    act on this screening result alone.
                  </p>
                </div>
              )}

              {/* Stat cards row */}
              <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 snap-x md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
                {/* 1 — Model score */}
                <div className="card min-w-[240px] snap-start p-5 md:min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink3">Model score</p>
                  <p className="tnum mt-2 text-[44px] font-medium leading-none tracking-tight md:text-[52px]">
                    {whole}
                    <span className="text-ink3">.{decimal}</span>
                    <span className="ml-1 align-top text-base text-ink3">%</span>
                  </p>
                  <div className="bar-track mt-4">
                    <div
                      className="bar-fill"
                      style={{ width: grown ? `${(result.model_score * 100).toFixed(1)}%` : "0%" }}
                      role="progressbar"
                      aria-valuenow={Math.round(result.model_score * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Model score"
                    />
                  </div>
                  <p className="mt-3 text-[11px] leading-snug text-ink3">
                    Confidence in the predicted class. Uncalibrated softmax — not a probability of disease.
                  </p>
                </div>

                {/* 2 — Confidence stripes */}
                <div className="card min-w-[240px] snap-start p-5 md:min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink3">Confidence</p>
                  <p className="tnum mt-2 text-[28px] font-medium leading-none md:text-[34px]">
                    {(result.model_score >= 0.55 && !result.is_uncertain) ? "Sufficient" : "Low"}
                  </p>
                  <div className="stripe-bar mt-4" aria-hidden="true">
                    {Array.from({ length: STRIPES }).map((_, i) => (
                      <span
                        key={i}
                        className={i < filledStripes ? "filled" : ""}
                        style={{ transitionDelay: `${i * 18}ms` }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-snug text-ink3">
                    Maximum softmax probability. Below 55% the scan is flagged inconclusive.
                  </p>
                </div>

                {/* 3 — Triage priority scale */}
                <div className="card min-w-[240px] snap-start p-5 md:min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink3">Triage priority</p>
                  <p
                    className="mt-2 flex items-center gap-2 text-[24px] font-medium leading-none md:text-[28px]"
                    style={{ color: statusColor }}
                  >
                    <span className="dot" style={{ background: statusColor }} />
                    {result.risk_level.replace(" (Urgent Referral)", "").replace(" (Routine)", "")}
                  </p>
                  <div className="relative mt-6">
                    <div className="h-1 rounded-full bg-white/8" />
                    {/* thresholds */}
                    <ThresholdMark pct={40} label="0.40 · Moderate" />
                    <ThresholdMark pct={75} label="0.75 · High" />
                    {/* current score dot */}
                    <span
                      className="absolute -top-[5px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-2 border-black"
                      style={{
                        left: `${(result.model_score * 100).toFixed(1)}%`,
                        background: statusColor,
                      }}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-ink3">
                    Score {(result.model_score * 100).toFixed(0)}% · cutoffs at 0.40 / 0.75
                  </p>
                </div>
              </div>

              {/* Image comparison card */}
              <div className="card p-4 md:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">X-ray views</h3>
                  <SegmentedControl
                    ariaLabel="Image view mode"
                    options={[
                      { value: "side", label: "Side-by-side" },
                      { value: "overlay", label: "Overlay" },
                      { value: "heat", label: "Heatmap" },
                    ]}
                    value={view}
                    onChange={(v) => setView(v as ViewMode)}
                  />
                </div>

                {view === "side" && (
                  <div className="grid grid-cols-2 gap-3">
                    <XrayPanel src={originalSrc} alt="Original chest X-ray" tag="Original" />
                    <XrayPanel
                      src={heatSrc}
                      alt="Grad-CAM heatmap showing regions that influenced the prediction"
                      tag="Grad-CAM"
                    />
                  </div>
                )}

                {view === "overlay" && result && (
                  <div>
                    <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/6 bg-black">
                      {originalSrc && (
                        <img
                          src={originalSrc}
                          alt="Original chest X-ray with Grad-CAM heatmap overlay"
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      )}
                      {heatSrc && (
                        <img
                          src={heatSrc}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full object-contain"
                          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                        />
                      )}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={split}
                      onChange={(e) => setSplit(Number(e.target.value))}
                      className="mt-3 w-full"
                      style={{ accentColor: "var(--violet)" }}
                      aria-label="Slide to compare original X-ray with Grad-CAM heatmap"
                    />
                    <div className="flex justify-between text-[10px] text-ink3">
                      <span>Original</span>
                      <span>Heatmap</span>
                    </div>
                  </div>
                )}

                {view === "heat" && (
                  <div className="mx-auto max-w-md">
                    <XrayPanel src={heatSrc} alt="Grad-CAM heatmap showing regions that influenced the prediction" tag="Grad-CAM" />
                  </div>
                )}

                {heatSrc && (
                  <div className="mt-4 space-y-1">
                    <div className="heatmap-legend" aria-hidden="true" />
                    <div className="flex justify-between text-[10px] text-ink3">
                      <span>Low influence</span>
                      <span>High influence</span>
                    </div>
                    <p className="pt-1 text-[10px] italic text-ink3">
                      Highlighted regions influenced the model&apos;s prediction. This does not confirm disease location.
                    </p>
                  </div>
                )}
              </div>

              {/* Analysis summary */}
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white">Analysis summary</h3>
                <dl className="space-y-2.5 text-sm">
                  <SummaryRow label="Prediction" value={result.prediction} />
                  <SummaryRow label="Model score" value={`${(result.model_score * 100).toFixed(1)}%`} />
                  <SummaryRow
                    label="Confidence"
                    value={result.is_uncertain ? "Low (inconclusive)" : "Sufficient for screening"}
                  />
                  <SummaryRow label="Triage" value={result.risk_level} />
                  <SummaryRow label="Processing time" value={`${elapsed.toFixed(1)} s`} />
                </dl>
              </div>

              {/* Plain-language explanation */}
              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <Info size={15} style={{ color: "var(--violetlight)" }} aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-white">What this means</h3>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-ink2">
                  {result.is_uncertain ? (
                    <>
                      The AI was unable to make a reliable assessment — the score falls inside the uncertainty zone.
                      Treat this as <strong className="text-white">inconclusive</strong> and have the patient evaluated
                      by a qualified professional.
                    </>
                  ) : result.prediction === "Pneumonia" ? (
                    <>
                      The AI detected patterns consistent with pneumonia. This is a{" "}
                      <strong className="text-white">screening result only</strong> — a radiologist or physician must
                      confirm the finding before any clinical decision.
                    </>
                  ) : (
                    <>
                      The AI found no strong indicators of pneumonia. Clinical judgment overrides this assessment — if
                      the patient has symptoms, seek professional evaluation.
                    </>
                  )}
                </p>
              </div>

              {/* Next steps */}
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white">Next steps</h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Link href="/hospitals" className="btn btn-white justify-center" aria-label="Find nearby hospitals">
                    <MapPin size={15} aria-hidden="true" />
                    Find nearby hospitals
                  </Link>
                  <Link href="/doctors" className="btn btn-dark justify-center" aria-label="Find a doctor">
                    <Stethoscope size={15} aria-hidden="true" />
                    Find a doctor
                  </Link>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                  <div className="flex items-center gap-2">
                    <IconButton label="Print report" onClick={handlePrint} className="no-print">
                      <Printer size={16} />
                    </IconButton>
                    <IconButton label="Save result as JSON" onClick={handleSave} className="no-print">
                      <Download size={16} />
                    </IconButton>
                  </div>
                  <PillButton variant="lime" onClick={handleReset} className="no-print" aria-label="Scan another X-ray">
                    <RotateCcw size={15} aria-hidden="true" />
                    Scan another
                  </PillButton>
                </div>
              </div>

              <DisclaimerBanner />
            </div>
          )}

          {/* ====== ERROR ====== */}
          {stage === "error" && (
            <div className="card p-8 text-center" role="alert">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border" style={{ background: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.3)" }}>
                <CircleAlert size={24} style={{ color: "var(--rederr)" }} aria-hidden="true" />
              </div>
              <h2 className="text-base font-bold text-white">Analysis failed</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-snug text-ink2">{errorMessage}</p>
              <PillButton variant="white" className="mt-5" onClick={handleReset}>
                Try again
              </PillButton>
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </>
  );
}

/* ---------- helpers ---------- */

function PrivacyNote() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink3">
      <span className="dot" style={{ background: "var(--lime)" }} aria-hidden="true" />
      Processed locally in ~1 second. Images are never stored or uploaded.
    </p>
  );
}

function ThresholdMark({ pct, label }: { pct: number; label: string }) {
  return (
    <>
      <span
        className="absolute -top-[5px] h-[18px] w-px border-l border-dashed"
        style={{ left: `${pct}%`, borderColor: "rgba(255,255,255,0.4)" }}
        aria-hidden="true"
      />
      <span
        className="chip chip-ink absolute top-2.5 !h-4 !px-1.5 text-[9px]"
        style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
      >
        {label}
      </span>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/4 pb-2.5 last:border-b-0 last:pb-0">
      <dt className="text-xs text-ink2">{label}</dt>
      <dd className="text-right text-sm font-medium text-white">{value}</dd>
    </div>
  );
}


