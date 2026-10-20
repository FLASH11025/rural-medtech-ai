"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { analyzeXRay, healthCheck } from "../lib/api";
import type { AnalysisResult } from "../lib/types";
import { BottomNav, TopBar, DisclaimerBanner, StatusBadge } from "./components/ui";

type Stage = "idle" | "selected" | "processing" | "result" | "error";

const PROCESSING_STEPS = [
  { id: "validate", label: "Validating image format" },
  { id: "preprocess", label: "Applying CLAHE preprocessing" },
  { id: "inference", label: "Running DenseNet-121 inference" },
  { id: "gradcam", label: "Generating Grad-CAM heatmap" },
];

export default function ScanPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check backend on mount
  useEffect(() => {
    healthCheck().then(setBackendOnline);
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type) && !file.name.endsWith(".dcm")) {
      setErrorMessage("Unsupported file. Please upload a JPEG or PNG chest X-ray.");
      setStage("error");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("File too large (max 15 MB). Please compress and retry.");
      setStage("error");
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setErrorMessage("");
    setStage("selected");
  }, []);

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

    // Simulate step progress (real progress isn't available from fetch)
    const stepTimer = setInterval(() => {
      setProcessingStep((s) => (s < PROCESSING_STEPS.length - 1 ? s + 1 : s));
    }, 800);

    try {
      const data = await analyzeXRay(selectedFile);
      clearInterval(stepTimer);
      setProcessingStep(PROCESSING_STEPS.length);
      setResult(data);
      setStage("result");
    } catch (err: unknown) {
      clearInterval(stepTimer);
      setErrorMessage(err instanceof Error ? err.message : "Analysis failed. Is the diagnostic engine running?");
      setStage("error");
    }
  };

  const handleReset = () => {
    setStage("idle");
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    setErrorMessage("");
    setProcessingStep(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Derive display status
  const getPredictionStatus = (): "pneumonia" | "normal" | "uncertain" => {
    if (!result) return "uncertain";
    if (result.is_uncertain) return "uncertain";
    return result.prediction === "Pneumonia" ? "pneumonia" : "normal";
  };

  const getScoreColor = (score: number, pred: string) => {
    if (result?.is_uncertain) return "bg-[var(--color-uncertain)]";
    if (pred === "Pneumonia") return "bg-[var(--color-pneumonia)]";
    return "bg-[var(--color-normal)]";
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

  return (
    <>
      <TopBar
        title="Rural MedTech AI"
        subtitle="Chest X-Ray Screening"
        action={
          backendOnline !== null && (
            <div className="flex items-center gap-1.5 text-xs">
              <div
                className={`w-2 h-2 rounded-full ${backendOnline ? "bg-[var(--color-success)]" : "bg-[var(--color-error)]"}`}
              />
              <span className="text-[var(--color-on-surface-subtle)]">
                {backendOnline ? "Engine online" : "Engine offline"}
              </span>
            </div>
          )
        }
      />

      <main className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Backend offline warning */}
        {backendOnline === false && (
          <div className="bg-[var(--color-error-light)] border border-[var(--color-error)] rounded-lg p-3 flex gap-2">
            <span className="material-symbols-outlined text-[var(--color-error)] text-[18px] flex-shrink-0">error</span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-error)]">Diagnostic engine offline</p>
              <p className="text-xs text-[var(--color-error)] mt-0.5">
                Start the backend: <code className="font-mono">cd backend && uvicorn main:app --port 8000</code>
              </p>
            </div>
          </div>
        )}

        {/* ====== IDLE / SELECTED STAGE ====== */}
        {(stage === "idle" || stage === "selected") && (
          <>
            {/* Upload zone */}
            <div
              className={`upload-zone p-6 text-center cursor-pointer ${dragOver ? "drag-over" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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

              {previewUrl && selectedFile ? (
                <div className="space-y-3">
                  <img
                    src={previewUrl}
                    alt="Selected X-ray preview"
                    className="max-h-56 mx-auto rounded-lg object-contain shadow-md"
                  />
                  <p className="text-sm text-[var(--color-on-surface-muted)] font-medium truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-[var(--color-on-surface-subtle)]">
                    {(selectedFile.size / 1024).toFixed(0)} KB · {selectedFile.type || "image/dcm"}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    className="text-xs text-[var(--color-error)] underline"
                    aria-label="Remove selected file"
                  >
                    Remove and choose another
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-16 h-16 rounded-full bg-[var(--color-primary-container)] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[36px] text-[var(--color-primary)]" aria-hidden="true">
                      add_photo_alternate
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--color-on-surface)] text-sm">
                      Drag & drop or tap to upload
                    </p>
                    <p className="text-xs text-[var(--color-on-surface-subtle)] mt-1">
                      JPEG, PNG, or DICOM · Max 15 MB
                    </p>
                  </div>
                  <p className="text-xs text-[var(--color-on-surface-subtle)] italic">
                    Frontal chest X-ray only
                  </p>
                </div>
              )}
            </div>

            {/* Privacy notice */}
            <p className="text-center text-[11px] text-[var(--color-on-surface-subtle)] flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">lock</span>
              Your image is processed locally. Nothing is sent to external servers.
            </p>

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={!selectedFile || backendOnline === false}
              className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: selectedFile && backendOnline !== false ? "var(--color-primary)" : undefined,
                color: "white",
                background: selectedFile && backendOnline !== false
                  ? "var(--color-primary)"
                  : "var(--color-border)",
              }}
              aria-label="Start X-ray analysis"
            >
              <span className="material-symbols-outlined" aria-hidden="true">biotech</span>
              Analyze X-Ray
            </button>

            <DisclaimerBanner />
          </>
        )}

        {/* ====== PROCESSING STAGE ====== */}
        {stage === "processing" && (
          <div className="card p-6 space-y-5">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary-container)] flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[32px] text-[var(--color-primary)] animate-pulse" aria-hidden="true">
                  model_training
                </span>
              </div>
              <h2 className="font-bold text-[var(--color-primary)] text-base">Analyzing X-Ray</h2>
              <p className="text-xs text-[var(--color-on-surface-subtle)] mt-1">
                Running DenseNet-121 inference locally…
              </p>
            </div>

            <div className="space-y-3" role="status" aria-live="polite" aria-label="Processing steps">
              {PROCESSING_STEPS.map((step, i) => {
                const isDone = i < processingStep;
                const isActive = i === processingStep;
                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isDone
                          ? "bg-[var(--color-success)] text-white"
                          : isActive
                          ? "bg-[var(--color-primary)] text-white"
                          : "bg-[var(--color-surface-container)] text-[var(--color-on-surface-subtle)]"
                      }`}
                    >
                      {isDone ? (
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      ) : isActive ? (
                        <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>
                      ) : (
                        <span className="text-[10px] font-bold">{i + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-sm ${
                        isDone
                          ? "text-[var(--color-success)]"
                          : isActive
                          ? "text-[var(--color-primary)] font-semibold"
                          : "text-[var(--color-on-surface-subtle)]"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {previewUrl && (
              <img
                src={previewUrl}
                alt="X-ray being analyzed"
                className="w-full max-h-32 object-contain rounded opacity-40"
              />
            )}
          </div>
        )}

        {/* ====== RESULT STAGE ====== */}
        {stage === "result" && result && (
          <div className="space-y-4" id="print-report">
            {/* Result header */}
            <div className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-on-surface-subtle)]">
                    AI Screening Result
                  </p>
                  <h2 className="text-2xl font-bold mt-0.5" style={{
                    color: getPredictionStatus() === "pneumonia"
                      ? "var(--color-pneumonia)"
                      : getPredictionStatus() === "normal"
                      ? "var(--color-normal)"
                      : "var(--color-uncertain)",
                  }}>
                    {result.is_uncertain
                      ? "Inconclusive"
                      : result.prediction === "Pneumonia"
                      ? "Pneumonia Indicated"
                      : "No Pneumonia Detected"}
                  </h2>
                </div>
                <StatusBadge status={getPredictionStatus()} />
              </div>

              {/* Model score bar */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-[var(--color-on-surface-subtle)]">
                    Model Score (uncalibrated softmax)
                  </span>
                  <span className="text-sm font-bold font-mono" style={{
                    color: getPredictionStatus() === "pneumonia"
                      ? "var(--color-pneumonia)"
                      : "var(--color-normal)",
                  }}>
                    {(result.model_score * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2.5 bg-[var(--color-surface-container)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getScoreColor(result.model_score, result.prediction)}`}
                    style={{ width: `${(result.model_score * 100).toFixed(1)}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(result.model_score * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </div>

              {/* Uncertainty warning */}
              {result.is_uncertain && (
                <div className="bg-[var(--color-uncertain-bg)] border border-[var(--color-uncertain)] rounded-lg p-3 flex gap-2">
                  <span className="material-symbols-outlined text-[var(--color-uncertain)] text-[18px] flex-shrink-0">
                    help
                  </span>
                  <p className="text-xs text-[var(--color-warning)] leading-snug">
                    <strong>Low confidence result.</strong> The model score is below the
                    reliable threshold (55%). This image requires professional radiological
                    assessment — do not act on this screening result alone.
                  </p>
                </div>
              )}
            </div>

            {/* Images: Original + Heatmap */}
            <div className="card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-primary)] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">image_search</span>
                X-Ray Analysis View
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Original */}
                <div className="space-y-1">
                  <div className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden">
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt="Original chest X-ray"
                        className="w-full h-full object-contain"
                      />
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                      Original
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-[var(--color-on-surface-subtle)]">Input Image</p>
                </div>

                {/* Heatmap */}
                <div className="space-y-1">
                  <div className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden">
                    {result.heatmap_base64 ? (
                      <img
                        src={result.heatmap_base64}
                        alt="Grad-CAM attention heatmap overlay"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-white text-xs text-center px-2">Heatmap unavailable</p>
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-[var(--color-secondary)]/80 text-white text-[9px] px-1.5 py-0.5 rounded">
                      Grad-CAM
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-[var(--color-on-surface-subtle)]">AI Focus Areas</p>
                </div>
              </div>

              {/* Heatmap legend */}
              {result.heatmap_base64 && (
                <div className="space-y-1">
                  <div className="heatmap-legend" aria-label="Heatmap color legend from low to high attention" />
                  <div className="flex justify-between text-[9px] text-[var(--color-on-surface-subtle)]">
                    <span>Low attention</span>
                    <span>High attention</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-on-surface-subtle)] italic">
                    Highlighted regions influenced the model&apos;s prediction. This does not confirm disease location.
                  </p>
                </div>
              )}
            </div>

            {/* Analysis summary */}
            <div className="card divide-y divide-[var(--color-border)] overflow-hidden">
              <div className="p-3 bg-[var(--color-surface-low)]">
                <h3 className="text-sm font-semibold text-[var(--color-primary)] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">analytics</span>
                  Analysis Summary
                </h3>
              </div>
              <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[10px] text-[var(--color-on-surface-subtle)] font-semibold uppercase tracking-wider">Prediction</p>
                  <p className="text-sm font-mono text-[var(--color-on-surface)] mt-0.5">{result.prediction}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--color-on-surface-subtle)] font-semibold uppercase tracking-wider">Model Score</p>
                  <p className="text-sm font-mono text-[var(--color-on-surface)] mt-0.5">{(result.model_score * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--color-on-surface-subtle)] font-semibold uppercase tracking-wider">Confidence</p>
                  <p className="text-sm font-mono text-[var(--color-on-surface)] mt-0.5">
                    {result.is_uncertain ? "Low (inconclusive)" : "Sufficient for screening"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--color-on-surface-subtle)] font-semibold uppercase tracking-wider">Triage Level</p>
                  <p className="text-sm font-mono text-[var(--color-on-surface)] mt-0.5">{result.risk_level}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-[var(--color-on-surface-subtle)] font-semibold uppercase tracking-wider">Analysis Time</p>
                  <p className="text-sm font-mono text-[var(--color-on-surface)] mt-0.5">{new Date().toLocaleTimeString()}</p>
                </div>
              </div>
            </div>

            {/* Plain-language finding */}
            <div className="card p-4 space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-primary)] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">description</span>
                What This Means
              </h3>
              <p className="text-sm text-[var(--color-on-surface)] leading-relaxed">
                {result.is_uncertain ? (
                  <>
                    The AI was unable to make a reliable assessment. The model score
                    ({(result.model_score * 100).toFixed(0)}%) falls within the uncertainty zone.
                    This result should be treated as <strong>inconclusive</strong> and the
                    patient must be evaluated by a qualified healthcare professional.
                  </>
                ) : result.prediction === "Pneumonia" ? (
                  <>
                    The AI detected patterns in this chest X-ray that are <strong>consistent with pneumonia</strong>.
                    The model score was {(result.model_score * 100).toFixed(0)}%.
                    This is a <em>screening result only</em> — a radiologist or physician
                    must confirm this finding before any clinical decision is made.
                  </>
                ) : (
                  <>
                    The AI found no strong indicators of pneumonia in this chest X-ray.
                    The model score was {(result.model_score * 100).toFixed(0)}%.
                    This is a <em>screening result only</em>. If the patient has symptoms,
                    clinical judgment should always override this AI assessment.
                  </>
                )}
              </p>
            </div>

            {/* Safety disclaimer */}
            <div className="card p-4 space-y-2 bg-[var(--color-surface-low)]">
              <h3 className="text-sm font-semibold text-[var(--color-on-surface-muted)] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">gavel</span>
                Medical Disclaimer
              </h3>
              <ul className="space-y-1 text-xs text-[var(--color-on-surface-subtle)] leading-relaxed list-none">
                <li>• This system is a <strong>screening assistance tool</strong>, not a diagnostic device.</li>
                <li>• The AI model (DenseNet-121) was trained on the Indiana University Chest X-Ray dataset (~68% validation accuracy). Performance on images from different equipment or populations may vary.</li>
                <li>• <strong>Do not make clinical decisions based solely on this output.</strong></li>
                <li>• Always refer patients to a qualified physician or radiologist for definitive diagnosis.</li>
                <li>• Model version: DenseNet-121 v1 (Indiana University dataset fine-tune, Jul 2026).</li>
              </ul>
            </div>

            {/* Next steps / navigation */}
            <div className="card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-primary)] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">directions</span>
                Recommended Next Steps
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/hospitals"
                  className="flex items-center gap-2 p-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-container)] transition-colors"
                >
                  <span className="material-symbols-outlined text-[var(--color-secondary)] text-[20px]">local_hospital</span>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-on-surface)]">Find Hospital</p>
                    <p className="text-[10px] text-[var(--color-on-surface-subtle)]">Nearby facilities</p>
                  </div>
                </Link>
                <Link
                  href="/doctors"
                  className="flex items-center gap-2 p-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-container)] transition-colors"
                >
                  <span className="material-symbols-outlined text-[var(--color-secondary)] text-[20px]">stethoscope</span>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-on-surface)]">Find Doctor</p>
                    <p className="text-[10px] text-[var(--color-on-surface-subtle)]">Specialists nearby</p>
                  </div>
                </Link>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 no-print">
              <button
                onClick={handlePrint}
                className="h-11 flex items-center justify-center gap-2 rounded-xl border border-[var(--color-primary)] text-[var(--color-primary)] font-semibold text-sm hover:bg-[var(--color-primary-container)] transition-colors"
                aria-label="Print report"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                Print Report
              </button>
              <button
                onClick={handleSave}
                className="h-11 flex items-center justify-center gap-2 rounded-xl border border-[var(--color-secondary)] text-[var(--color-secondary)] font-semibold text-sm hover:bg-[var(--color-secondary-container)] transition-colors"
                aria-label="Save result as JSON"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                Save Result
              </button>
            </div>

            <button
              onClick={handleReset}
              className="w-full h-11 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[var(--color-primary-dark)] transition-colors no-print"
              aria-label="Scan another X-ray"
            >
              <span className="material-symbols-outlined text-[18px]">document_scanner</span>
              Scan Another X-Ray
            </button>
          </div>
        )}

        {/* ====== ERROR STAGE ====== */}
        {stage === "error" && (
          <div className="card p-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-[var(--color-error-light)] flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] text-[var(--color-error)]" aria-hidden="true">
                error
              </span>
            </div>
            <div>
              <h2 className="font-bold text-[var(--color-error)] text-base">Analysis Failed</h2>
              <p className="text-sm text-[var(--color-on-surface-muted)] mt-2 leading-snug">{errorMessage}</p>
            </div>
            {errorMessage.includes("engine") && (
              <div className="text-left bg-[var(--color-surface-container)] rounded-lg p-3">
                <p className="text-xs font-semibold text-[var(--color-on-surface-muted)] mb-2">To start the backend:</p>
                <code className="text-xs font-mono text-[var(--color-primary)] block">
                  cd backend<br />
                  ..\.venv\Scripts\activate<br />
                  uvicorn main:app --port 8000
                </code>
              </div>
            )}
            <button
              onClick={handleReset}
              className="w-full h-11 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm"
            >
              Try Again
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}
