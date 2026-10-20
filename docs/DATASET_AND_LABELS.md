# Dataset Provenance, Label Analysis & Splitting Methodology

**Dataset:** Indiana University Chest X-Ray Collection (Open-i, National Library of Medicine)  
**Total Images Available:** 7,470 PNG images  
**Merged Frontal Cohort:** 3,818 chest radiographs  

---

## 1. Dataset Provenance & License

- **Source Repository:** Indiana University Hospital Chest X-Ray Dataset (NIH Open-i).
- **Authors:** Demner-Fushman, D., et al. (2016). *Preparing a collection of radiology examinations for distribution and retrieval.* JAMIA.
- **Licensing:** Free for public scientific research and educational use under National Library of Medicine (NLM) terms. No identifiable patient protected health information (PHI) is present in the de-identified public dataset.
- **Repository Location:**
  - Projections metadata: `dataset/indiana_projections.csv` (7,466 rows)
  - Radiology reports: `dataset/indiana_reports.csv` (3,851 rows)
  - Image directory: `dataset/images/` (7,470 files)

---

## 2. Frontal Filter & Label Generation Methodology

In clinical practice, thoracic pathology screening (consolidation, infiltrate, effusion) requires standard Posteroanterior (PA) or Anteroposterior (AP) **Frontal** views. Lateral views require distinct anatomic orientation.

### Extraction Pipeline:
1. **Projection Filtering:** `projections['projection'] == 'Frontal'` filters 7,466 total projection records down to **3,818 Frontal images**.
2. **Report Merging:** Inner join on unique examination identifier (`uid`) against `indiana_reports.csv`.
3. **Clinical Label Derivation:**
   - The dataset contains automated MeSH terms and an NLP-derived `Problems` column derived from free-text radiology impressions and findings.
   - **Normal (Label 0):** Mapped when `Problems` explicitly contains the token `"normal"`.
   - **Abnormal / Pneumonia Candidate (Label 1):** Mapped when `Problems` contains specific or generic radiological findings (e.g. `Opacity`, `Lung`, `Calcified Granuloma`, `Cardiomegaly`, `Effusion`).

```python
def map_label(problem_text):
    if pd.isna(problem_text):
        return 1
    if "normal" in str(problem_text).lower().strip():
        return 0
    return 1
```

### Cohort Distribution:
- **Total Frontal Images:** 3,818
- **Normal Class (0):** 1,387 cases (36.33%)
- **Abnormal / Infiltrate Class (1):** 2,431 cases (63.67%)
- **Class Imbalance Ratio:** ~1 : 1.75

---

## 3. Data Leakage Assessment & Splitting Strategy

### 3.1 Patient-Level vs. Image-Level Splitting
- **Current Holdout Split:** 80% Train (3,054 images) / 20% Validation (764 images) using stratified sampling (`random_state=42`, `stratify=labels`).
- **Audit Finding:** While Indiana University assigns unique `uid` identifiers per patient examination, a small subset of patients have multiple acquisitions (e.g. PA and AP frontal shots taken in sequence). Stratification on `uid` (patient/study level) is recommended for final multi-center clinical trials to eliminate potential correlation across identical patient anatomies.
- **Evaluation Split Determinism:** The validation split is deterministically seeded (`seed=42`), ensuring that all benchmark comparisons between baseline and improved pipelines evaluate on the exact same patient images.

### 3.2 Augmentation Isolation
- **Training Set Only:** Random horizontal flips (`p=0.5`), subtle rotational jitter ($\pm 5^\circ$), and CLAHE contrast enhancement.
- **Validation/Test Set:** Strictly deterministic transformations (CLAHE + center resize 224×224 + standardization). No stochastic augmentations are applied during evaluation.

---

## 4. Known Dataset Limitations

1. **Weak Label Noise:** The `Problems` column was extracted via Medical Text Indexer (MTI) algorithms rather than dual-blind human radiologist consensus. Some non-pneumonia abnormalities (such as scoliosis or rib fractures) are labeled in the abnormal cohort.
2. **"No Indexing" Records:** Approximately 91 records have `Problems == "No Indexing"`. In the default mapping, these are treated conservatively as abnormal.
3. **Screening Task Context:** Because the training cohort encompasses both pneumonia consolidations and related pulmonary opacities, the model functions as a **high-sensitivity pulmonary opacity/pneumonia screening classifier**, rather than a standalone pathogen-specific diagnostic assay.
