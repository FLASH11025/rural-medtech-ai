import type { AnalysisResult, Hospital, Doctor, ModelStatus } from "./types";

const API_BASE = "/api";

export async function analyzeXRay(imageFile: File): Promise<AnalysisResult> {
  // Client-side validation
  const MAX_SIZE_MB = 15;
  if (imageFile.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
  }
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(imageFile.type) && !imageFile.name.endsWith(".dcm")) {
    throw new Error("Unsupported file type. Please upload a JPEG, PNG, or DICOM file.");
  }

  const formData = new FormData();
  formData.append("file", imageFile);

  const response = await fetch(`${API_BASE}/analyze-xray`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Unknown server error" }));
    throw new Error(err.detail || `Server error: ${response.status}`);
  }

  return response.json();
}

export async function fetchHospitals(params?: {
  q?: string;
  district?: string;
}): Promise<Hospital[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.district) qs.set("district", params.district);
  const url = `${API_BASE}/hospitals${qs.toString() ? "?" + qs.toString() : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load hospitals");
  return res.json();
}

export async function fetchDoctors(params?: {
  specialty?: string;
  district?: string;
}): Promise<Doctor[]> {
  const qs = new URLSearchParams();
  if (params?.specialty) qs.set("specialty", params.specialty);
  if (params?.district) qs.set("district", params.district);
  const url = `${API_BASE}/doctors${qs.toString() ? "?" + qs.toString() : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load doctors");
  return res.json();
}

export async function getModelStatus(): Promise<ModelStatus> {
  const res = await fetch(`${API_BASE}/model-status`);
  if (!res.ok) throw new Error("Failed to get model status");
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
