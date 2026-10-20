# PROJECT AUDIT — Rural MedTech AI Triage System

**Audit Date:** 2026-10-19  
**Auditor:** Automated engineering review  
**Repository root:** `project 110/rural-medtech/`

---

## 1. Existing Architecture

```
rural-medtech/
├── backend/
│   ├── main.py              # FastAPI app + XRayPreprocessor + RuralDiagnosticEngine + Grad-CAM (ALL IN ONE FILE)
│   ├── inference.py         # Duplicate of model/Grad-CAM classes (not imported by main.py — dead code)
│   ├── preprocessing.py     # Duplicate of XRayPreprocessor (not imported by main.py — dead code)
│   ├── train_indiana.py     # Training script (standalone, uses PIL path not CLAHE path)
│   ├── requirements.txt     # fastapi, uvicorn, opencv-python, pydicom, numpy, torch, torchvision
│   ├── models/
│   │   └── densenet121_pneumonia.pth   (28.4 MB — 727-key state dict)
│   └── densenet121-a639ec97.pth        (32.3 MB — original ImageNet weights, unused at runtime)
├── dataset/
│   ├── indiana_projections.csv   (7,466 rows: uid, filename, projection)
│   ├── indiana_reports.csv       (3,851 rows: uid, MeSH, Problems, findings, impression, ...)
│   └── images/                   (7,470 PNG files)
└── frontend/
    ├── app/
    │   ├── layout.tsx        # Root layout (Inter font, Material Symbols CDN)
    │   ├── page.tsx          # Single-page app: upload + results (225 lines)
    │   └── globals.css       # Tailwind v4 + Material Design 3 color tokens
    ├── lib/
    │   └── api.js            # analyzeXRay() fetch helper
    ├── next.config.ts        # Rewrites /api/* → http://127.0.0.1:8000/*
    └── package.json          # Next.js 16.2.11, React 19, Tailwind v4, TypeScript
```

**Virtual environment:** `project 110/.venv/` — Python 3.14 runtime  
**Installed:** PyTorch 2.13.0+cpu, OpenCV 5.0.0, FastAPI, Uvicorn, pydicom

---

## 2. Existing Working Features

| Feature | Status | Evidence |
|---------|--------|----------|
| Backend starts (uvicorn) | ✅ Working | `sys_err.log` shows startup complete |
| Frontend starts (Next.js) | ✅ Working | `dev_out.log` shows Ready in 1031ms |
| `/health` endpoint | ✅ Working | 200 OK in logs |
| `/analyze-xray` endpoint | ✅ Working | 200 OK in logs |
| Model checkpoint loads | ✅ Working | 727 keys, no missing/unexpected |
| DenseNet-121 architecture | ✅ Correct | 2-class head (Normal/Pneumonia) |
| CLAHE preprocessing (inference) | ✅ Present | clipLimit=2.0, tileGridSize=(8,8) |
| Softmax + argmax prediction | ✅ Correct | F.softmax → torch.max |
| Grad-CAM hooks | ✅ Present | denseblock4.denselayer16.conv2 |
| Grad-CAM heatmap overlay | ✅ Present | 60% original + 40% heatmap |
| Frontend upload UI | ✅ Working | File picker + preview |
| Frontend results display | ✅ Working | Prediction + confidence + heatmap shown |
| API proxy rewrite | ✅ Working | /api/* → localhost:8000/* |
| Dataset exists | ✅ Present | 7,470 PNG images |
| Dataset labels | ✅ Match presentation | 3,818 frontal, 1,387 normal, ~2,431 abnormal |

---

## 3. Missing or Broken Features

### Critical Gaps
| Issue | Severity | Notes |
|-------|----------|-------|
| **Preprocessing mismatch train vs inference** | 🔴 HIGH | Training uses PIL Grayscale→ToTensor (no CLAHE). Inference uses CLAHE. Distribution shift. |
| **`inference.py` and `preprocessing.py` are dead code** | 🟡 MED | Not imported by main.py. Confusing duplicate code. |
| **No multi-page routing** | 🔴 HIGH | Single page only. No hospital finder, doctor finder, report, history, settings pages |
| **No hospital/doctor directory** | 🔴 HIGH | Referenced in nav but not implemented |
| **No PDF/printable report** | 🔴 HIGH | Required feature entirely absent |
| **Nav items are dead links (cursor-default)** | 🔴 HIGH | Queue, Dashboard nav items do nothing |
| **No drag-and-drop upload** | 🟡 MED | Only click-to-browse |
| **Confidence labeled as "Confidence"** | 🟡 MED | Should be labeled "Model Score (uncalibrated softmax)" |
| **No uncertainty/inconclusive state** | 🟡 MED | All images get a confident result |
| **No file validation (MIME/size/format)** | 🟡 MED | Backend accepts any bytes |
| **CORS: allow_origins=["*"]** | 🟡 MED | Should be restricted to localhost in production |
| **No privacy statement on upload page** | 🟡 MED | Required per spec |
| **No empty state on history page** | 🟡 MED | Page doesn't exist |
| **No settings page** | 🟡 LOW | Not implemented |
| **Label logic groups "No Indexing" as Pneumonia** | 🟡 MED | 91 "No Indexing" records treated as abnormal |
| **No patient-level train/val split** | 🟡 MED | Current split is image-level (risk of patient leakage) |
| **No test set** | 🟡 MED | Only train/val split (80/20) |
| **Triage based solely on confidence** | 🟡 MED | Confidence and urgency are conflated |
| **No model-unavailable error state** | 🟡 MED | Falls back to ImageNet weights silently |
| **No Grad-CAM error handling** | 🟡 MED | Heatmap generation failures crash endpoint |
| **No PWA manifest** | 🟡 LOW | Claimed as PWA but no manifest.json |
| **No README** | 🟡 LOW | No setup instructions |

---

## 4. Model and Dataset Status

### Model
- **File:** `backend/models/densenet121_pneumonia.pth` (28.4 MB, saved 25-Jul-2026)
- **Architecture:** DenseNet-121 with 2-class linear classifier head
- **Load result:** 727 keys, 0 missing, 0 unexpected — CLEAN LOAD
- **Purpose:** Fine-tuned for Normal vs. Pneumonia (not just ImageNet)
- **Grad-CAM target:** `features.denseblock4.denselayer16.conv2` — appropriate final conv layer
- **Concern:** Training preprocessing ≠ inference preprocessing (CLAHE only in inference)

### Dataset
- **Total images:** 7,470 PNG files
- **Indiana University Chest X-Ray Collection**
- **Frontal images:** 3,818 (exactly matches presentation)
- **Normal cases:** 1,387 (where Problems == "normal")
- **Abnormal cases:** ~2,431 (all other entries including "No Indexing": 91 records)
- **Label source:** `Problems` column from radiology reports — NLP-derived, not ground-truth annotations
- **Key limitation:** "No Indexing" (91 cases) means no label was assigned — treated as abnormal in current code, which is questionable
- **Patient-level split:** NOT implemented — current split is random image-level

---

## 5. Known Errors

1. **Path issue in batch scripts:** `'C:\Users\crazy\OneDrive\Desktop\major' is not recognized` — spaces in path not quoted in old batch startup scripts (resolved by using PowerShell)
2. **Preprocessing mismatch:** Training PIL pipeline vs inference CLAHE pipeline
3. **Dead code confusion:** `inference.py` and `preprocessing.py` exist but are not used
4. **Silent fallback:** On checkpoint not found, falls back to ImageNet weights with only a print warning — no API indication to frontend

---

## 6. Baseline Model Metrics

**Reported in presentation:** 68.06% validation accuracy (3 epochs, classifier-only fine-tuning, Focal Loss)

**Verified from checkpoint:** Checkpoint exists and loads correctly. Baseline metrics were measured during training and saved as best checkpoint at val_acc ~68%.

**Formal baseline evaluation:** Requires running `evaluate_baseline.py` script against a held-out test set. Dataset analysis confirms sufficient images exist.

**Class distribution:** Normal 1,387 (36.3%) vs. Abnormal 2,431 (63.7%) — moderate imbalance, appropriate for Focal Loss.

---

## 7. Implementation Priorities (Ordered)

1. 🔴 **Fix preprocessing mismatch** — align training CLAHE pipeline with inference
2. 🔴 **Add multi-page routing** — Hospital Finder, Doctor Finder, Report, History, Settings
3. 🔴 **Implement hospital/doctor directory** — local JSON/CSV data with search/filter
4. 🔴 **Build PDF/print report** — from actual inference results
5. 🔴 **Polish UI/UX** — redesign with consistent design system, drag-and-drop, mobile-responsive
6. 🟡 **Add file validation** — MIME, size, format checking on both ends
7. 🟡 **Fix confidence labeling** — label as "Model Score" not "Confidence"
8. 🟡 **Add uncertainty/inconclusive states** — threshold-based
9. 🟡 **Fix nav items** — all nav elements must be functional links
10. 🟡 **Add README and docs** — setup instructions, architecture overview
11. 🟡 **Improve model evaluation** — run baseline metrics, document formally
12. 🟡 **Security hardening** — restrict CORS, validate inputs properly
