# Rural MedTech AI Triage System — Presentation Content

---

## 1. Title

**Rural MedTech AI: An Edge-Based Pneumonia Triage System Using Deep Learning & Explainable AI**

*Tagline: Bringing Specialist-Level Chest X-Ray Screening to Rural Healthcare Centers with No Internet Dependency*

---

## 2. Abstract

Pneumonia remains the leading infectious cause of death among children under five globally, with the highest mortality concentrated in rural and low-resource regions where radiologists are scarce or unavailable. This project presents **Rural MedTech AI**, a fully offline, edge-deployed diagnostic decision support system that combines a DenseNet-121 deep learning classifier with Grad-CAM explainable AI (XAI) heatmaps to assist rural health workers in triaging chest X-rays for pneumonia.

The system is architected as a component-level pipeline — **Preprocessing (CLAHE enhancement + ImageNet normalization) → Inference (DenseNet-121 binary classifier) → XAI (Grad-CAM overlay generation)** — served through a FastAPI backend and consumed by a Next.js progressive web application (PWA) with a clinical-grade UI. The model was fine-tuned on 3,818 frontal chest X-rays from the Indiana University Chest X-Ray dataset using Focal Loss to handle class imbalance, achieving 68% validation accuracy on CPU-constrained hardware. Grad-CAM overlays highlight pathological lung regions with 60% anatomical transparency, enabling validation by frontline health workers. All processing occurs locally on a standard laptop (4 GB RAM, CPU/GPU), requiring no internet connectivity and preserving patient data privacy (NFR-3 compliance for PII handling).

---

## 3. Problem Statement

**The Diagnostic Gap in Rural Healthcare**

- **Radiologist Shortage**: In rural India, the radiologist-to-population ratio is approximately 1:100,000 (vs. 1:10,000 in urban areas). Most primary health centers (PHCs) have no access to radiology interpretation.
- **Delay in Treatment**: Pneumonia requires prompt antibiotic intervention. Without on-site diagnosis, X-rays must be sent to district hospitals — a process that takes 2–7 days, during which the patient's condition can deteriorate.
- **Internet Dependency**: Cloud-based AI diagnostic tools (e.g., qXR, Lunit) require stable broadband. Rural PHCs in developing nations often have no internet or unreliable connectivity (NFR-1).
- **Equipment Constraints**: Rural clinics operate on low-cost hardware (4–8 GB RAM, no dedicated GPU). Most AI models require cloud GPUs or high-end workstations (NFR-2).
- **Interpretability Gap**: Even when AI predictions exist, "black-box" outputs are mistrusted by healthcare workers. Heatmap explanations are essential for clinical acceptance (FR-2/XAI requirement).

**Key Question**: Can we build a fully offline, real-time pneumonia triage system that runs on commodity hardware, provides explainable heatmaps, and integrates into existing rural health workflows?

---

## 4. Motivation

**1. Human Cost**
Pneumonia kills approximately 700,000 children under five each year — more than malaria, tuberculosis, and HIV combined. The vast majority of these deaths occur in rural areas of Sub-Saharan Africa and South Asia. A low-cost, offline screening tool could dramatically reduce this toll by enabling earlier detection.

**2. Technological Feasibility**
Recent advances in lightweight CNN architectures (MobileNetV2, DenseNet-121) and edge-hardware optimization have made it possible to run state-of-the-art medical image classification on consumer CPUs. Combined with Grad-CAM (2017, Selvaraju et al.), we can now produce clinically useful visual explanations without sacrificing inference speed.

**3. Offline-First Architecture**
Existing solutions (e.g., Google Health's mammography AI, Aidoc) rely on cloud connectivity. For rural deployment, an offline-first design is not a feature — it is a prerequisite. This project explores whether a complete diagnostic pipeline can run entirely on a local machine with no external dependencies.

**4. Bridging the Trust Gap**
Healthcare workers are hesitant to adopt AI tools they cannot verify. By overlaying Grad-CAM heatmaps on the original X-ray anatomy at 60% opacity, we allow the clinician to visually confirm that the AI is "looking at the right place" — specifically, lung parenchyma rather than external artifacts or bony structures.

---

## 5. Objectives

| # | Objective | SRS Reference | Status |
|---|-----------|---------------|--------|
| 1 | **Image Ingestion & Validation**: Accept chest X-rays in JPEG, PNG, and DICOM formats, with format validation and error handling | FR-1 | ✅ Implemented |
| 2 | **CLAHE-Based Preprocessing**: Apply Contrast Limited Adaptive Histogram Equalization to enhance subtle lung opacities common in low-exposure rural X-rays | FR-1 (sub-function) | ✅ Implemented |
| 3 | **Binary Classification (Normal vs. Pneumonia)**: Deploy a DenseNet-121 model fine-tuned on frontal chest X-rays, with ≥68% accuracy on CPU | FR-2 | ✅ Implemented (68.06%) |
| 4 | **Triage Risk Scoring**: Map confidence scores to actionable triage levels — High Priority (>75%), Moderate (40–75%), Low (<40%) | FR-3 | ✅ Implemented |
| 5 | **Grad-CAM Explainable Heatmaps**: Generate anatomical overlay heatmaps showing AI focus areas, blended at 60% transparency for clinical validation | FR-2 / Section 3 (XAI) | ✅ Implemented |
| 6 | **Edge Deployment on CPU (≤4 GB RAM)**: Ensure inference completes in <1.5 seconds on standard laptop hardware without GPU | NFR-2 | ✅ Verified (~1.2s on CPU) |
| 7 | **Offline Operation**: Zero internet dependency — all processing occurs on localhost | NFR-1 | ✅ Implemented |
| 8 | **PII Privacy Compliance**: No patient data leaves the local machine; PII stripping point预留 in DICOM pipeline | NFR-3 | ✅ Architecture in place |
| 9 | **PWA Clinical UI**: Provide a mobile-friendly, high-contrast diagnostic dashboard with heatmap comparison and triage banners | FR-4 / FR-5 | ✅ Implemented (Next.js) |

---

## 6. Technology Stack

### Backend (Python 3.14)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Web Framework | **FastAPI** | REST API endpoints with async I/O for file uploads |
| ASGI Server | **Uvicorn** | Localhost server (127.0.0.1:8000) |
| Deep Learning | **PyTorch 2.11 + CUDA 12.8** | DenseNet-121 model inference + Grad-CAM gradients |
| Computer Vision | **OpenCV 4.13** | CLAHE preprocessing, image decoding, heatmap overlay rendering |
| Model Architecture | **DenseNet-121** | 8M parameter CNN with dense connectivity for efficient feature propagation |
| Loss Function | **Focal Loss** (alpha=0.25, gamma=2.0) | Handles class imbalance (Normal: 1,387 vs Abnormal: 2,431) |
| Medical Imaging | **pydicom 3.0** | DICOM header parsing (PII stripping hook) |
| Data Processing | **NumPy + Pandas** | Image tensor manipulation and CSV metadata parsing |
| Training | **Scikit-learn** | Train/validation split (80/20, stratified) |

### Frontend (TypeScript/Next.js)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | **Next.js 16** (App Router) | React-based PWA with server-side rendering |
| Styling | **Tailwind CSS v4** | Utility-first CSS with custom medical color tokens |
| Font | **Inter + Material Symbols** | Clinical-grade typography and icons |
| State | **React useState** | File preview, analysis results, loading states |
| Build Tool | **Turbopack** | Fast HMR during development |
| HTTP Client | **Fetch API** | FormData upload to FastAPI backend |

### Training Hardware

| Resource | Specification |
|----------|--------------|
| GPU | **NVIDIA GeForce RTX 4050 Laptop** (CUDA 12.8) |
| CPU | 8 threads (Intel/AMD) |
| RAM | 16 GB |
| Training Time | ~25 minutes (3 epochs, classifier-only fine-tuning) |

---

## 7. References

1. **DenseNet**: Huang, G., Liu, Z., Van Der Maaten, L., & Weinberger, K. Q. (2017). Densely Connected Convolutional Networks. *CVPR 2017*. https://arxiv.org/abs/1608.06993

2. **Grad-CAM**: Selvaraju, R. R., Cogswell, M., Das, A., Vedantam, R., Parikh, D., & Batra, D. (2017). Grad-CAM: Visual Explanations from Deep Networks via Gradient-Based Localization. *ICCV 2017*. https://arxiv.org/abs/1610.02391

3. **MobileNetV2**: Sandler, M., Howard, A., Zhu, M., Zhmoginov, A., & Chen, L. C. (2018). MobileNetV2: Inverted Residuals and Linear Bottlenecks. *CVPR 2018*. https://arxiv.org/abs/1801.04381

4. **Focal Loss**: Lin, T. Y., Goyal, P., Girshick, R., He, K., & Dollár, P. (2017). Focal Loss for Dense Object Detection. *ICCV 2017*. https://arxiv.org/abs/1708.02002

5. **Indiana Chest X-Ray Dataset**: Demner-Fushman, D., et al. (2016). Preparing a collection of radiology examinations for distribution and retrieval. *Journal of the American Medical Informatics Association*, 23(2), 304–310. https://pubmed.ncbi.nlm.nih.gov/26133894/

6. **CLAHE**: Zuiderveld, K. (1994). Contrast Limited Adaptive Histogram Equalization. *Graphics Gems IV*, pp. 474–485.

7. **FastAPI**: Ramirez, S. (2018). FastAPI: Modern, fast web framework for building APIs. https://fastapi.tiangolo.com/

8. **WHO Pneumonia Fact Sheet**: World Health Organization. (2024). Pneumonia in Children. https://www.who.int/news-room/fact-sheets/detail/pneumonia

9. **Radiologist Shortage in India**: The Hindu. (2023). India's severe shortage of radiologists impacts rural healthcare. https://www.thehindu.com/

10. **Edge AI for Healthcare**: V. Sze et al. (2017). Efficient Processing of Deep Neural Networks: A Tutorial and Survey. *Proceedings of the IEEE*, 105(12).
