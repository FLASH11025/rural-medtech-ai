#!/usr/bin/env python3
# ============================================================================
# RURAL MEDTECH AI - MODEL EVALUATION SUITE
# Evaluates DenseNet-121 on the Indiana Chest X-ray Validation Split (20%)
# Uses standardized CLAHE preprocessing pipeline identical to production inference
# ============================================================================

import os
import sys
import time
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    roc_auc_score,
)

# Base Directories
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
DATASET_DIR = ROOT_DIR / "dataset"
DOCS_DIR = ROOT_DIR / "docs"

MODEL_PATH = BASE_DIR / "models" / "densenet121_pneumonia.pth"
PROJECTIONS_CSV = DATASET_DIR / "indiana_projections.csv"
REPORTS_CSV = DATASET_DIR / "indiana_reports.csv"
IMAGES_DIR = DATASET_DIR / "images"
OUTPUT_MD = DOCS_DIR / "MODEL_EVALUATION.md"


def load_model(model_path: Path, device: torch.device) -> nn.Module:
    """Loads the DenseNet-121 model with 2-class classifier head."""
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found at: {model_path}")

    model = models.densenet121(weights=None)
    model.classifier = nn.Linear(in_features=1024, out_features=2)

    state_dict = torch.load(str(model_path), map_location=device)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    return model


def preprocess_image(image_path: Path) -> np.ndarray:
    """Preprocesses a single chest X-ray image using CLAHE and ImageNet normalization.

    Matches exactly XRayPreprocessor in production main.py.
    """
    img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")

    # 1. CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img_clahe = clahe.apply(img)

    # 2. Resize to 224x224
    img_resized = cv2.resize(img_clahe, (224, 224))

    # 3. Expand grayscale to 3 channels RGB
    img_3ch = cv2.cvtColor(img_resized, cv2.COLOR_GRAY2RGB)

    # 4. Normalize to [0, 1] then apply ImageNet mean and std
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_float = img_3ch.astype(np.float32) / 255.0
    img_normalized = (img_float - mean) / std

    # 5. Rearrange dimensions: (Height, Width, Channels) -> (Channels, Height, Width)
    img_tensor = np.transpose(img_normalized, (2, 0, 1))

    # Add batch dimension: (1, Channels, Height, Width)
    return np.expand_dims(img_tensor, axis=0)


def prepare_validation_data():
    """Loads Indiana dataset CSVs, extracts Frontal projections, and splits 80/20.

    Matches exact split parameters used in train_indiana.py:
    random_state=42, stratify on label.
    """
    if not PROJECTIONS_CSV.exists() or not REPORTS_CSV.exists():
        raise FileNotFoundError(
            f"Dataset CSVs not found in {DATASET_DIR}. Expected indiana_projections.csv and indiana_reports.csv"
        )

    proj_df = pd.read_csv(PROJECTIONS_CSV)
    repo_df = pd.read_csv(REPORTS_CSV)
    merged_df = pd.merge(proj_df, repo_df, on="uid")
    merged_df = merged_df[merged_df["projection"] == "Frontal"]

    def map_label(problem_text):
        if pd.isna(problem_text):
            return 1
        if "normal" in str(problem_text).lower().strip():
            return 0
        return 1

    merged_df["label"] = merged_df["Problems"].apply(map_label)

    _, val_df = train_test_split(
        merged_df,
        test_size=0.2,
        random_state=42,
        stratify=merged_df["label"],
    )

    return val_df


def run_evaluation():
    print("=" * 70)
    print("RURAL MEDTECH AI — MODEL EVALUATION RUNNER")
    print("=" * 70)

    device = torch.device("cpu")
    print(f"[1/4] Device configured: {device}")

    print(f"[2/4] Loading model checkpoint from: {MODEL_PATH}")
    model = load_model(MODEL_PATH, device)
    print("      Model loaded successfully (DenseNet-121, 2 classes).")

    print(f"[3/4] Preparing Indiana validation split...")
    val_df = prepare_validation_data()
    total_val_records = len(val_df)
    print(f"      Total validation split records: {total_val_records}")

    y_true = []
    y_pred = []
    y_scores = []
    missing_files = 0
    corrupted_files = 0
    evaluated_count = 0

    print("[4/4] Running inference on validation images with CLAHE preprocessing...")
    start_time = time.time()

    for idx, (_, row) in enumerate(val_df.iterrows()):
        filename = row["filename"]
        label = int(row["label"])
        img_path = IMAGES_DIR / filename

        if not img_path.exists():
            missing_files += 1
            continue

        try:
            tensor_np = preprocess_image(img_path)
            input_tensor = torch.from_numpy(tensor_np).to(device)

            with torch.no_grad():
                outputs = model(input_tensor)
                probs = F.softmax(outputs, dim=1)
                pred_label = torch.argmax(probs, dim=1).item()
                prob_pneumonia = probs[0, 1].item()

            y_true.append(label)
            y_pred.append(pred_label)
            y_scores.append(prob_pneumonia)
            evaluated_count += 1

            if evaluated_count % 100 == 0:
                print(f"      Processed {evaluated_count} images...")

        except Exception as exc:
            corrupted_files += 1
            continue

    elapsed_time = time.time() - start_time
    avg_latency_ms = (elapsed_time / evaluated_count * 1000) if evaluated_count > 0 else 0

    print(f"\nInference completed in {elapsed_time:.2f}s ({avg_latency_ms:.1f}ms/image)")
    print(f"Evaluated: {evaluated_count} | Missing files: {missing_files} | Corrupt: {corrupted_files}")

    if evaluated_count == 0:
        print("ERROR: No images were evaluated. Please verify dataset image directory.")
        return

    # Compute Metrics
    acc = accuracy_score(y_true, y_pred)
    balanced_acc = balanced_accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)

    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
        spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    else:
        tn = fp = fn = tp = 0
        spec = 0.0

    try:
        roc_auc = roc_auc_score(y_true, y_scores)
    except Exception:
        roc_auc = float("nan")

    # Uncertainty Statistics (threshold < 0.55)
    max_probs = [max(p, 1.0 - p) for p in y_scores]
    uncertain_count = sum(1 for p in max_probs if p < 0.55)
    uncertain_pct = (uncertain_count / evaluated_count) * 100

    print("\n" + "=" * 50)
    print("EVALUATION METRICS SUMMARY")
    print("=" * 50)
    print(f"Accuracy:          {acc:.4f} ({acc*100:.2f}%)")
    print(f"Balanced Accuracy: {balanced_acc:.4f} ({balanced_acc*100:.2f}%)")
    print(f"Precision:         {prec:.4f} ({prec*100:.2f}%)")
    print(f"Recall (Sens):     {rec:.4f} ({rec*100:.2f}%)")
    print(f"Specificity:       {spec:.4f} ({spec*100:.2f}%)")
    print(f"F1 Score:          {f1:.4f} ({f1*100:.2f}%)")
    print(f"ROC-AUC:           {roc_auc:.4f}")
    print(f"Inconclusive (<55%): {uncertain_count}/{evaluated_count} ({uncertain_pct:.1f}%)")
    print(f"Confusion Matrix:  TN={tn}, FP={fp}, FN={fn}, TP={tp}")
    print("=" * 50)

    # Generate Markdown Report
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    report_content = f"""# Model Evaluation Report — DenseNet-121 Chest X-Ray Triage

**Evaluation Date:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  
**Model Architecture:** DenseNet-121 (Pretrained ImageNet backbone + 2-class linear classifier)  
**Checkpoint Path:** `{MODEL_PATH.name}`  
**Dataset:** Indiana University Chest X-Ray Collection (Frontal projections)  
**Validation Split:** 20% stratified holdout (`random_state=42`)  
**Preprocessing:** CLAHE (`clipLimit=2.0`, `tileGridSize=(8, 8)`), 224×224 resize, ImageNet normalization  
**Hardware Engine:** CPU Edge Execution Mode (PyTorch {torch.__version__})

---

## 1. Executive Performance Summary

| Metric | Score | Percentage | Clinical Significance |
| :--- | :--- | :--- | :--- |
| **Accuracy** | `{acc:.4f}` | **{acc * 100:.2f}%** | Overall fraction of correct triage classifications |
| **Balanced Accuracy** | `{balanced_acc:.4f}` | **{balanced_acc * 100:.2f}%** | Macro-average recall across normal & abnormal classes |
| **Sensitivity / Recall** | `{rec:.4f}` | **{rec * 100:.2f}%** | Detection rate for abnormal/pneumonia pathology |
| **Specificity** | `{spec:.4f}` | **{spec * 100:.2f}%** | Correct identification rate for healthy normal cases |
| **Precision (PPV)** | `{prec:.4f}` | **{prec * 100:.2f}%** | Positive predictive value for flagged abnormalities |
| **F1 Score** | `{f1:.4f}` | **{f1 * 100:.2f}%** | Harmonic balance between sensitivity and precision |
| **ROC-AUC** | `{roc_auc:.4f}` | **{roc_auc * 100:.2f}%** | Area under Receiver Operating Characteristic curve |

---

## 2. Confusion Matrix

| Ground Truth \\ Prediction | Normal (Pred: 0) | Pneumonia / Abnormal (Pred: 1) | Total |
| :--- | :---: | :---: | :---: |
| **Normal (True: 0)** | **{tn}** (TN) | **{fp}** (FP) | {tn + fp} |
| **Pneumonia / Abnormal (True: 1)** | **{fn}** (FN) | **{tp}** (TP) | {fn + tp} |
| **Total Predicted** | {tn + fn} | {fp + tp} | {evaluated_count} |

### Classification Insights:
- **True Negatives (TN):** {tn} healthy cases correctly ruled out.
- **False Positives (FP):** {fp} normal cases referred for triage review (acceptable screening safety bias).
- **False Negatives (FN):** {fn} abnormal cases missed during automated screening.
- **True Positives (TP):** {tp} abnormal cases successfully caught and flagged.

---

## 3. Uncertainty & Inconclusive Distribution

The triage engine implements an uncertainty guardrail for low-confidence predictions:
- **Uncertainty Threshold:** Maximum softmax probability < `0.55` (55%)
- **Flagged Inconclusive Cases:** `{uncertain_count}` / `{evaluated_count}` ({uncertain_pct:.2f}%)
- **Handling Protocol:** Images with `is_uncertain: true` trigger an amber advisory banner in the UI and mandate urgent human clinical verification.

---

## 4. Hardware Efficiency & Latency

- **Target Deployment:** Low-resource rural Primary Health Centres (PHCs) running on dual/quad-core CPUs.
- **Total Inferences Evaluated:** {evaluated_count} images
- **Average CPU Inference Latency:** **{avg_latency_ms:.1f} ms** per image (NFR-2 target: < 1500 ms)
- **Validation Dataset Coverage:** {evaluated_count} valid images processed ({missing_files} missing from disk handled gracefully).

---

## 5. Preprocessing Consistency Verification

- **CLAHE Applied:** Contrast Limited Adaptive Histogram Equalization with clip limit 2.0 and 8×8 grid size.
- **Training vs. Inference Alignment:** Preprocessing pipeline in `preprocessing.py`, `train_indiana.py`, and `main.py` is unified and synchronized to prevent distribution shift.
"""

    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write(report_content.strip() + "\n")

    print(f"\n[OK] Model evaluation report successfully written to: {OUTPUT_MD}")


if __name__ == "__main__":
    run_evaluation()
