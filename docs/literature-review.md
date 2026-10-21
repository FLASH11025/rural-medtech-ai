# Towards Offline, Explainable Chest X-Ray Screening for Rural India: A Literature Review for Rural MedTech AI

> **Medical disclaimer.** This document reviews published literature in support of *Rural MedTech AI*, a **research and development prototype**. The associated system is a **screening aid only — it is not a diagnostic tool**. It has not received regulatory clearance (CE, FDA, CDSCO, or equivalent), has not been clinically validated, and its output must never drive treatment decisions without independent radiological review.

---

## Abstract

Pneumonia and tuberculosis impose a disproportionate burden on rural South Asia, yet the radiologists needed to interpret chest radiographs are concentrated in urban tertiary hospitals. This review surveys the literature underpinning *Rural MedTech AI*, a fully offline, edge-deployed chest X-ray screening platform designed for primary health centres in Andhra Pradesh and Telangana. Seven themes are examined: deep learning for chest X-ray classification (CheXNet, ChestX-ray14, CheXpert, MIMIC-CXR); contrast-limited adaptive histogram equalisation (CLAHE) preprocessing; gradient-based explainability (CAM, Grad-CAM, Grad-CAM++, LIME, SHAP); focal loss for class imbalance; uncertainty estimation and abstention in clinical AI; offline and low-resource deployment strategies (lightweight CNNs, integer quantisation, progressive web applications); and field-deployed computer-aided detection (CAD) programmes for tuberculosis screening. The review identifies four persistent gaps — cloud dependence, black-box outputs, absent uncertainty handling, and weakly integrated workflows in low-resource deployments — and shows how the project's design choices respond to them: a DenseNet-121 two-class classifier, CLAHE pipelines, Grad-CAM overlays on lung parenchyma, a 0.55 softmax abstention threshold, and localhost-only processing delivered through a FastAPI/Next.js PWA stack. Limitations, including demo-only directory data and the absence of clinical validation, are stated explicitly.

---

## 1. Introduction

Pneumonia remains the single largest infectious cause of death among children worldwide. The World Health Organization estimates that pneumonia accounted for 14% of all deaths of children under five, killing 740,180 children in 2019, with mortality concentrated disproportionately in southern Asia and sub-Saharan Africa [1]. UNICEF places annual under-five pneumonia deaths above 700,000 — roughly one child every 43 seconds — and estimates that 18 million additional health workers are needed by 2030 to reach universal health-coverage targets for pneumonia alone [2]. Endemic co-burden compounds the picture: India carries the largest share of the world's incident tuberculosis cases (approximately 27% [VERIFY] in recent WHO estimates), and the current WHO guideline on systematic TB screening recommends chest radiography combined with computer-aided detection (CAD) software as a core screening pathway [3], [4].

Access to interpretation, not access to images, is the binding constraint. Only about 20,500 radiologists are registered with the Indian Society of Radiology and Imaging for a population of 1.4 billion — approximately one per 100,000 people, versus one per 10,000 in the United States — and specialists cluster in large cities while roughly 60% of the Indian population, including most of rural Andhra Pradesh and Telangana, lacks equitable access to diagnostic radiology [5]. A chest X-ray taken at a primary health centre (PHC) may take days to reach a radiologist, during which treatable pneumonia progresses; cloud-based commercial triage products also presuppose stable broadband, which rural PHCs cannot rely on.

Three properties therefore matter simultaneously: **connectivity-free operation**, **low hardware cost**, and **transparency that frontline workers can audit**. This paper reviews the literature under those constraints and positions Rural MedTech AI — a DenseNet-121 two-class classifier (Normal vs. Pneumonia/Abnormal) with CLAHE preprocessing, Grad-CAM explainability, focal-loss training, a 0.55-confidence uncertainty gate, and a fully local FastAPI + Next.js PWA stack — within that body of work.

---

## 2. Related Work

### 2.1 Deep Learning for Chest X-Ray Classification

The modern lineage of AI chest X-ray screening begins with CheXNet, in which Rajpurkar et al. fine-tuned a 121-layer DenseNet on the ChestX-ray8/ChestX-ray14 corpus to classify pneumonia, reporting an F1 comparable to a small radiologist reading panel [6]. The enabling data asset was hospital-scale: Wang et al. introduced ChestX-ray8, 108,948 frontal images from 32,717 patients with text-mined weak labels, and released the expanded ChestX-ray14 corpus (112,120 frontal images of 30,805 patients [VERIFY], 14 thoracic finding classes [7]), demonstrating that NLP-derived labels can train competitive models while inheriting their noise. Subsequent public corpora industrialised the task: CheXpert (224,316 images of 65,240 patients [VERIFY]) added explicit uncertainty labels for findings reports merely *mention* or *suspect* [8], and MIMIC-CXR released ~380,000 view images linked to free-text reports and structured annotations [9]. Architecturally, the field's default is transfer learning from ImageNet-pretrained convolutional networks; DenseNet-121 dominates partly because dense connectivity preserves spatial detail at low parameter count [10] — a property that also explains its ubiquity in edge-deployed medical models, including this project and the Qure.ai/Lunit CAD systems reviewed by WHO [4]. Litjens et al.'s landmark survey frames the broader shift [11].

Two caveats run through this literature: weak labels mined from radiology reports include incidental, non-pulmonary abnormalities [7], [8]; and, as CheXpert's expert-comparison design shows, accuracy reporting must specify which label policy was applied — a level of detail uncommon in small-scale systems.

### 2.2 Image Preprocessing and Enhancement (CLAHE)

Hospital-curated datasets under-represent the acquisition variability of rural equipment — lossy JPEG/PNG artefacts, indifferently calibrated mobile X-ray generators, under-exposed plates [4], [5]. Histogram-equalisation methods counteract low dynamic range: standard adaptive histogram equalisation (AHE) amplifies noise and can over-enhance artefacts around dense structures [13], while contrast-limited adaptive histogram equalisation (CLAHE) clips local histogram spikes at a configurable ceiling and redistributes the clipped mass, constraining local amplification [12]. Zuiderveld's Graphics Gems formulation made CLAHE computationally practical via interpolation between neighbouring tiles [12]; Pizer et al.'s foundational analysis documents precisely the noise-amplification failure modes that clipping was designed to control [13].

Rural MedTech AI configures CLAHE conservatively (`clipLimit=2.0`, `tileGridSize=(8, 8)`), applied to 8-bit grayscale inputs before channel replication, resize to 224×224, and ImageNet-statistics normalisation. The project's own documentation records an instructive reproducibility pitfall: an early training run used PIL-based transforms without CLAHE while inference applied CLAHE — a train–serve distribution gap flagged in the code audit and later synchronised across training, evaluation, and production inference paths.

### 2.3 Explainable AI in Medical Imaging

Clinician trust is a deployment-side bottleneck distinct from accuracy. Class-activation mapping (CAM) showed that a globally-pooled feature map locates pathological activations [14]. Grad-CAM (Selvaraju et al.) generalised the idea to arbitrary architectures by pooling backpropagated gradients over final-convolution feature maps, yielding class-discriminative heatmaps without retraining [15]; its fidelity for multiple or large objects was later improved by Grad-CAM++'s weighted ReLU-gradient pooling [16]. Model-agnostic alternatives — LIME's surrogate interpretable models [17] and SHAP's Shapley-value attributions [18] — are theoretically grounded but too computationally expensive for interactive triage on PHC hardware.

Rural MedTech AI implements Grad-CAM at `features.denseblock4.denselayer16.conv2`, mirrors the ReLU–normalisation–JET-colormap pipeline [15], blends 60% original anatomy with 40% heatmap [15] to preserve anatomical landmarks, and makes heatmap generation non-fatal (a Grad-CAM failure returns the prediction without the overlay). The blend ratio is deliberate: frontline users must be able to verify that heat lies on lung parenchyma — cardiac border, costophrenic angles, lung fields — rather than bones or external artefacts.

### 2.4 Class Imbalance and Loss Functions

Real screening cohorts are imbalanced — toward abnormality in clinically enriched collections, toward normality in population-scale screening — and either direction biases a cross-entropy model toward the majority class. Focal loss (Lin et al., ICCV 2017) reshapes the per-sample loss via $(1-p_t)^\gamma$ with α balancing positive/negative masses, concentrating optimisation on "hard" examples [19]. The related family — class-weighted cross-entropy, Dice-based losses, label smoothing — pursues the same goal; focal loss additionally preserves a meaningful gradient for confidently-wrong items, which matters when downstream triage tiers act on softmax outputs. Rural MedTech AI applies it with the standard hyperparameters (α=0.25, γ=2.0) on its 1,387 Normal / 2,431 Abnormal frontal cohort (~1:1.75 imbalance). When that cohort's labels are themselves produced by imperfect report-keyword mapping, weak-labelling noise compounds imbalance (see §5).

### 2.5 Uncertainty Estimation and Abstention in Clinical AI

Begoli et al. argue that machine-assisted medical decisions without principled uncertainty quantification (UQ) are, in their formulation, "neither predictions nor actionable" [20]. Bayesian deep learning supplies concrete machinery: dropout can act as a Bayesian approximation, making MC-dropout inference an add-on rather than a retraining burden [21]. Leibig et al. show that dropout-derived uncertainty supports informed decision referral in diabetic-retinopathy screening — referring the 0–20% most-uncertain cases reached the NHS-recommended operating points of ≥85% sensitivity at ≥80% specificity — and that softmax output alone is not a sufficient uncertainty proxy [22]. The same logic extends the classic recognition error–reject trade-off theory of Chow (abstain below a decision-specific boundary) [24]. Oakden-Rayner et al. add a structural warning: aggregate metrics conceal "hidden stratification" — performance cliffs on rare or sicker subpopulations invisible to overall scores [23].

Rural MedTech AI implements a deliberately conservative abstention: when the softmax maximum falls below 0.55, the scan is flagged `is_uncertain` and routed to an "Inconclusive — Requires Human Review" state (about 6.8% of the project's validation cohort is affected, in `docs/MODEL_EVALUATION.md`). The project also candidly labels its outputs *uncalibrated softmax* — honest, but against the UQ literature such output is neither a Bayesian uncertainty [21] nor a referral-grade proxy [22]; §5 returns to this limitation.

### 2.6 Offline / Edge / Low-Resource Deployment

Mobile-era architectures made edge inference tractable: MobileNets [25] and MobileNetV2 [26] kept competitive accuracy with depthwise-separable and inverted-residual designs, while integer-only quantisation approaches floating-point accuracy with 8-bit weights and activations on embedded hardware [27]. Sze et al.'s survey condenses the compute-side enablers: model compression, structured sparsity, accelerator-aware mapping [28] — though quantisation's speed–fidelity trade-offs remain under-characterised for medical imaging. On the web side, a progressive web application (PWA) with service-worker caching and a manifest lets clinicians "install" a tool from the browser without app-store intermediaries and keeps functioning on intermittent or zero network [29].

That combination is precisely the Rural MedTech AI stack: a Next.js 16 PWA front-end loads and caches locally and talks only to a strict-localhost FastAPI engine (bound to 127.0.0.1:8000, restricted CORS), retaining history in browser `localStorage` with per-item deletion — a structural prohibition on external transmission rather than a policy-level promise. Inference runs on a commodity multi-core CPU with no discrete GPU, a 28.4 MB checkpoint, and project-documented ~340 ms average latency inside the SRS's <1.5 s envelope.

### 2.7 AI Screening Tools in Rural and Low-Resource Healthcare

Field-deployed CAD is not hypothetical. Eneogu et al. evaluate iterative mobile digital chest X-ray + CAD4TB screening in Nigeria — "Wellness on Wheels" trucks with lead-lined X-ray suites and portable Xpert laboratories — documenting sustained operational cadence, per-population threshold tuning, and CAD as a *triage* rather than diagnostic tool [30]. WHO guidance is explicit that CAD may substitute for human readers only in screening/triage contexts, pending bacteriological confirmation [4]; companion implementations in hard-to-reach Nigerian rural communities report CAD4TB score-gating of sputum referral with radiologist second-read [4], [30]. The design lessons — local threshold calibration, human fallback paths, workflow-integrated referral — inform this project's triage tiers without being transplanted wholesale.

Critically, none of the landmark corpora is itself an Indian rural PHC deployment: the datasets [7]–[9] are US-centric, the CAD4TB field studies [30] are Nigerian, and WHO's CAD evidence draws on deployments outside India. Rural MedTech AI is designed around that gap: referral interfaces covering 30 AP/Telangana facilities (Government, PHC, Private — across eight districts including Nellore, Kurnool, Visakhapatnam, Tirupati, Guntur, Vijayawada, Hyderabad, and Warangal), with coordinates, services, and contacts (demo-flagged data — §5), complementary to CAD4TB-style screening at a different disease focus (pneumonia versus TB) and readiness level.

---

## 3. Comparison of Key Papers

*(Results are as reported by the respective authors; "—" not applicable.)*

| # | Work (Year) | Method | Dataset / Setting | Key Results (as reported) | Limitations Noted |
|---|-------------|--------|-------------------|---------------------------|-------------------|
| 1 | CheXNet [6] (2017) | DenseNet-121 fine-tune, one-vs-all pneumonia | ChestX-ray14 (112,120 frontals [VERIFY]) | F1 0.435 vs. 0.387 for the radiologist panel; AUC 0.8192 on held-out pneumonia [VERIFY exact values] | Single finding class; weak US labels; small expert study |
| 2 | ChestX-ray8/14 [7] (2017) | Weakly supervised multi-label CNN benchmarking | 108,948 frontals, 32,717 patients; 14-label NIH release [VERIFY counts] | Text-mined labels train competitive classifiers; weak localization | Label noise from NLP mining; incidental abnormalities inflate "abnormal" |
| 3 | CheXpert [8] (2019) | Multi-label CNNs; uncertainty label policies | 224,316 images, 65,240 patients [VERIFY] | Large-scale benchmark; expert comparison across label variants | Uncertainty mapping is itself a modelling choice; US single-institution |
| 4 | MIMIC-CXR [9] (2019) | Radiograph + report corpus, NLP structuring | ~377,110 images, ~227,827 reports [VERIFY counts] | Largest open CXR corpus at release | US tertiary care; report structure ≠ ground truth |
| 5 | Grad-CAM [15] (2017) | Gradient-weighted localization at final conv layer | Visualisation method (VGG/ResNet tasks) | Class-discriminative localization without retraining; agrees with human regions in CXR captioning [VERIFY] | Coarse final-conv resolution; no calibrated rejection |
| 6 | Focal Loss [19] (2017) | $(1-p_t)^\gamma$ modulated loss | Object detection (RetinaNet) | Directly targets imbalance in dense tasks | Hyperparameters dataset-specific; medical benefit is empirical |
| 7 | Dropout-as-UQ [21] (2016) | MC-dropout Bayesian approximation | Theory + small experiments | Principled epistemic uncertainty at low cost | Sparse adoption in production clinical AI |
| 8 | Leibig et al. [22] (2017) | Dropout-UQ with decision referral | Diabetic retinopathy | Most-uncertain 0–20% referral reached NHS operating points (≥85% sens., ≥80% spec.) | Uncertainty captured is task- and setting-dependent |
| 9 | Oakden-Rayner et al. [23] (2020) | "Hidden stratification" subset evaluation | CIFAR-100 + medical cohorts | >20% relative gaps on clinically meaningful subsets [VERIFY] | Requires manually defined strata |
| 10 | Begoli et al. [20] (2019) | UQ discipline for medical AI | Perspective paper | UQ framing for regulated pipelines | No empirical benchmark |
| 11 | CAD4TB deployments [30], [4] (2021–2024) | Mobile trucks + Delft CAD4TB | Nigerian rural/state populations | CAD-gated (score ≥40/60) sputum referral; operational at scale [VERIFY thresholds per site] | Thresholds need per-population calibration (WHO [4]) |
| 12 | WHO Module-2 Guidelines [4] (2021) | CAD in place of human readers (screening/triage) | WHO GDG evidence appraisal | CAD comparable to human readers for screening & triage | Screening ≠ diagnosis; not an accuracy endorsement |

---

## 4. Research Gaps and How Rural MedTech AI Addresses Them

**(a) Connectivity is a hard requirement, not a feature.** Commercial products and most research codebases assume server-side GPUs and cloud retrieval; field systems like CAD4TB trucks prove offline is possible but at institutional budgets. The gap is a commodity laptop at a PHC with nothing installed and no network. Rural MedTech AI addresses it structurally: strict-localhost engine, restricted-CORS API, browser-only PWA, `localStorage`-only history, and print-to-PDF reporting enforce "images never leave the machine" by architecture, not policy.

**(b) Explainability rarely reaches the point of decision.** Grad-CAM overlays in the literature target expert verification; the rural operator is a health worker without radiology training. The project's 60:40 anatomy-to-heatmap blend, deliberately preserving landmarks beneath the heat, follows the Grad-CAM recipe [15] while targeting that non-expert audit path — the black-box mistrust identified in §2.3.

**(c) Uncertainty is usually an afterthought.** Leibig et al. showed softmax output alone is not a sufficient uncertainty signal [22]. Rural MedTech AI exposes abstention as a first-class state (< 0.55 confidence ⇒ `is_uncertain`, amber advisory, ~6.8% of the validation cohort) — without yet claiming the Bayesian-dropout or ensemble machinery the literature would require, which its own limitations state outright.

**(d) Workflow-level integration.** Accuracy studies rarely ship referral scaffolding. The project pairs screening output (triage tiers: High >0.75, Moderate 0.40–0.75, Low ≤0.40 — fixed in the project SRS) with an offline AP/Telangana facility directory (30 facilities across eight districts, Haversine-sorted by device GPS, call and map-link actions) and printable referral summaries — the CAD4TB "screen, gate, refer" pattern translated to pneumonia.

**(e) Honest evaluation of small cohorts.** The project's docs separate its training-time baseline (~68.06% validation accuracy, 3-epoch classifier-only fine-tune) from a later pipeline-parity evaluation (accuracy 84.6%, sensitivity 88.2%, specificity 71.4%, PPV 83.1%, F1 85.6%, ROC-AUC 0.874 — as stated in `docs/MODEL_EVALUATION.md`), label the score *uncalibrated*, and flag known label noise. That divergence between internal claims is presented as-is, not smoothed over.

---

## 5. Limitations of Rural MedTech AI (Honest Assessment)

1. **No clinical validation.** All metrics are internal validation-set figures on the Indiana University collection; there is no prospective, multi-centre, IRB-approved evaluation. The feature audit lists clinical-trial validation as *blocked* (ethics clearance and PHC recruitment pending; `docs/FEATURE_STATUS.md`).
2. **Demo directory data.** The 30 AP/Telangana hospitals and 25 specialist profiles are synthetic demonstration records (`is_demo: true`, `last_verified: 2026-01-01`); names, numbers, and coordinates need independent verification before real use.
3. **Small, single-site, weak-label dataset.** 3,818 frontal X-rays from one US collection; labels are NLP-derived from a `Problems` text field, not radiologist consensus; 91 "No Indexing" unlabelled records are conservatively mapped to Abnormal, injecting noise; incidental non-pulmonary abnormalities widen the "Abnormal" class.
4. **Two-class design only.** No TB-specific or multi-label variant reaching into the NIH/CheXpert taxonomy; no differentiation of pneumonia versus consolidation versus effusion.
5. **Image-level, not patient-level, split.** The 80/20 stratified split is image-level (theoretical patient leakage risk, flagged in `docs/DATASET_AND_LABELS.md`) and there is no held-out test set — only train/val.
6. **Simplistic uncertainty proxy.** A single softmax pass below 0.55 is neither a Bayesian uncertainty [21] nor a referral-grade proxy [22]; no calibration analysis (reliability curves, temperature scaling) has been run.
7. **Metric inconsistency across project docs.** The training log reports ~68% validation accuracy; the pipeline-parity evaluation reports 84.6%. The discrepancy (historically, different preprocessing paths) is unresolved, so no single final number can yet be claimed.
8. **Partial DICOM handling.** DICOM inputs are converted through 8-bit PNG; 16-bit Hounsfield windowing is deferred, and automatic stripping of patient metadata from DICOM headers is not implemented.
9. **Untested device heterogeneity.** Latency (~340 ms) and memory (~450 MB) come from one development machine's benchmark; rural multi-device profiling has not been performed.
10. **Grad-CAM limits.** Heatmap resolution is bounded by the final convolution grid; a correct-in-region map can miss subtle boundaries, and the overlay is not a substitute for radiologist annotation.

---

## 6. Conclusion and Future Work

The reviewed literature shows mature accuracy enablers — public corpora [7]–[9], transfer learning [10], imbalance-aware losses [19], field-proven triage gating [30] — while the distinctively rural constraints (connectivity-free operation [4], [5], commodity hardware [25]–[28], transparency for non-specialists [15]–[18], abstention [20]–[24]) remain under-served at their intersection. Rural MedTech AI sits precisely there: a deliberately small, fully local screening stack whose individual techniques are all established, but whose *combined configuration* — CLAHE → DenseNet-121 → Grad-CAM → abstain-or-triage → offline referral directory → printable record — is assembled around the PHC-room operational constraint.

**Near-term work (per the project's own roadmap):** patient-level re-splitting and a fully held-out test set; an external cohort for distribution-shift evaluation; DICOM/PWA hardening; Telugu/Hindi localisation; refinement of triage and uncertainty thresholds.

**Medium-term work:** multi-label extensions towards controlled thoracic vocabularies (NIH 14-class, TB-specific outputs) leveraging ChestX-ray14 [7] and CheXpert [8] transfer data; Bayesian-dropout [21] or ensemble [22] uncertainty machinery; probability calibration; INT8 quantised variants for embedded deployment [27].

**Longer-term work:** an ethics-committee-approved prospective field study in Andhra Pradesh/Telangana PHCs, structured after CAD4TB mobile-truck deployments [30]: per-district threshold calibration, bacteriological (e.g., Xpert) or expert confirmation, and human-factors evaluation of heatmap-guided referral by non-radiologists — closing the translation loop already proven elsewhere.

Until then, the honest verdict is the project's own: a screening aid whose Grad-CAM heatmap and triage summary should be read as a second pair of eyes for a health worker — never as a radiologist, and never, by itself, as a diagnosis.

---

## 7. References (IEEE style)

> Entries marked **[VERIFY]** contain a detail that could not be fully confirmed at the time of writing and should be spot-checked against the original source before formal submission.

[1] World Health Organization, "Pneumonia in children" (fact sheet, updated 11 November 2022), WHO, Geneva, 2022. Available: https://www.who.int/news-room/fact-sheets/detail/pneumonia

[2] UNICEF, "Pneumonia in children — UNICEF DATA," accessed October 2026. Available: https://data.unicef.org/topic/child-health/pneumonia/

[3] World Health Organization, *Global Tuberculosis Report*, WHO, Geneva, 2023. (India accounts for approximately 27% of estimated global incident TB cases [VERIFY edition and exact share].)

[4] World Health Organization, *WHO Consolidated Guidelines on Tuberculosis, Module 2: Screening — Systematic Screening for Tuberculosis Disease*, ISBN 978-92-4-002267-6, WHO, Geneva, 2021. (CAD programmes may be used in place of human readers for interpreting digital chest radiographs in screening and triage — conditional recommendation.)

[5] A. Chandramohan, V. Krothapalli, A. Augustin, M. Kandagaddala, and H. M. Thomas, "Teleradiology and technology innovations in radiology: status in India and its role in increasing access to primary health care," *The Lancet Regional Health — Southeast Asia*, vol. 20, 2023. Available: https://www.thelancet.com/journals/lansea/article/PIIS2772-3682(23)00055-0/fulltext [VERIFY article number/pages.]

[6] P. Rajpurkar, J. Irvin, K. Zhu, B. Yang, H. Mehta, T. Duan, D. Ding, A. Bagul, C. Langlotz, B. Shpall, F. C. P. Wu, A. Y. Ng, and M. P. Lungren, "CheXNet: Radiologist-level pneumonia detection on chest X-rays with deep learning," arXiv preprint arXiv:1711.05225, 2017. [Author list beyond first two [VERIFY].]

[7] X. Wang, Y. Peng, L. Lu, Z. Lu, M. Bagheri, and R. M. Summers, "ChestX-ray8: Hospital-scale chest X-ray database and benchmarks on weakly-supervised classification and localization of common thorax diseases," in *Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR)*, 2017, pp. 2097–2106. (ChestX-ray14 is the expanded 14-label release of the same NIH group: 112,120 frontals of 30,805 patients [VERIFY counts].)

[8] J. Irvin, P. Rajpurkar, M. Ko, Y. Yu, et al., "CheXpert: A large chest radiograph dataset with uncertainty labels and expert comparison," in *Proc. AAAI Conf. Artif. Intell.*, vol. 33, 2019, pp. 590–597. [VERIFY full author list and pages.]

[9] A. E. W. Johnson, T. J. Pollard, S. J. Berkowitz, N. R. Greenbaum, M. P. Lungren, C.-y. Deng, R. G. Mark, and S. Horng, "MIMIC-CXR: A de-identified publicly available database of chest radiographs with free-text reports," *Sci. Data*, vol. 6, Art. no. 317, 2019. [VERIFY author order.]

[10] G. Huang, Z. Liu, L. van der Maaten, and K. Q. Weinberger, "Densely connected convolutional networks," in *Proc. IEEE CVPR*, 2017, pp. 4700–4708. (arXiv:1608.06993)

[11] G. Litjens, T. Kooi, B. E. Bejnordi, A. A. A. Setio, F. Ciompi, M. Ghafoorian, J. A. W. M. van der Laak, B. van Ginneken, and C. I. Sánchez, "A survey on deep learning in medical image analysis," *Med. Image Anal.*, vol. 42, pp. 60–88, 2017.

[12] K. Zuiderveld, "Contrast limited adaptive histogram equalization," in *Graphics Gems IV*, P. S. Heckbert, Ed. San Diego, CA, USA: Academic Press, 1994, pp. 474–485.

[13] S. M. Pizer, E. P. Amburn, J. D. Austin, R. Cromartie, A. Geselowitz, T. Greer, B. ter Haar Romeny, J. B. Zimmerman, and K. Zuiderveld, "Adaptive histogram equalization and its variations," *Comput. Vis. Graph. Image Process.*, vol. 39, no. 3, pp. 355–368, 1987. [VERIFY volume/pages.]

[14] B. Zhou, A. Khosla, A. Lapedriza, A. Oliva, and A. Torralba, "Learning deep features for discriminative localization," in *Proc. Eur. Conf. Comput. Vis. (ECCV)*, 2016, pp. 292–305. [VERIFY pages.]

[15] R. R. Selvaraju, M. Cogswell, A. Das, R. Vedantam, D. Parikh, and D. Batra, "Grad-CAM: Visual explanations from deep networks via gradient-based localization," in *Proc. IEEE Int. Conf. Comput. Vis. (ICCV)*, 2017, pp. 618–626. (arXiv:1610.02391)

[16] A. Chattopadhyay, A. Sarkar, P. Howlader, and V. N. Balasubramanian, "Grad-CAM++: Improved visual explanations for deep neural networks," in *Proc. IEEE Winter Conf. Appl. Comput. Vis. (WACV)*, 2018, pp. 839–847. [VERIFY pages.]

[17] M. T. Ribeiro, S. Singh, and C. Guestrin, "'Why should I trust you?': Explaining the predictions of any classifier," in *Proc. 22nd ACM SIGKDD Int. Conf. Knowl. Discov. Data Min.*, 2016, pp. 1135–1144.

[18] S. Lundberg and S.-I. Lee, "A unified approach to interpreting model predictions," in *Proc. NeurIPS*, 2017, pp. 4765–4774.

[19] T.-Y. Lin, P. Goyal, R. Girshick, K. He, and P. Dollár, "Focal loss for dense object detection," in *Proc. IEEE ICCV*, 2017, pp. 2980–2988. (arXiv:1708.02002)

[20] E. Begoli, T. Bhattacharya, and D. Kusnezov, "The need for uncertainty quantification in machine-assisted medical decision making," *Nat. Mach. Intell.*, vol. 1, pp. 20–23, 2019. [VERIFY pages.]

[21] Y. Gal and Z. Ghahramani, "Dropout as a Bayesian approximation: Representing model uncertainty in deep learning," in *Proc. 33rd Int. Conf. Mach. Learn. (ICML)*, 2016, PMLR vol. 48. [VERIFY volume.]

[22] C. Leibig, V. Allken, M. S. Ayhan, P. Berens, and S. Wahl, "Leveraging uncertainty information from deep neural networks for disease detection," *Sci. Rep.*, vol. 7, Art. no. 17816, 2017.

[23] L. Oakden-Rayner, J. Dunnmon, G. Carneiro, and C. Ré, "Hidden stratification causes clinically meaningful failures in machine learning for medical imaging," in *Proc. ACM Conf. Health Inference Learn. (CHIL)*, 2020, pp. 151–159.

[24] C. K. Chow, "On optimum recognition error and reject tradeoff," *IEEE Trans. Inf. Theory*, vol. IT-16, no. 1, 1970. [VERIFY volume/pages.]

[25] A. G. Howard, M. Zhu, B. Chen, D. Kalenichenko, W. Wang, T. Weyand, M. Andreetto, and H. Adam, "MobileNets: Efficient convolutional neural networks for mobile vision applications," arXiv preprint arXiv:1704.04861, 2017.

[26] M. Sandler, A. Howard, M. Zhu, A. Zhmoginov, and L.-C. Chen, "MobileNetV2: Inverted residuals and linear bottlenecks," in *Proc. IEEE CVPR*, 2018, pp. 4510–4520. (arXiv:1801.04381)

[27] B. Jacob, S. Kligys, B. Chen, M. Zhu, M. Tang, A. Howard, H. Adam, and D. Kalenichenko, "Quantization and training of neural networks for efficient integer-arithmetic-only inference," in *Proc. IEEE CVPR*, 2018, pp. 2704–2713.

[28] V. Sze, Y.-H. Chen, T.-J. Yang, and J. S. Emer, "Efficient processing of deep neural networks: A tutorial and survey," *Proc. IEEE*, vol. 105, no. 12, pp. 2295–2329, 2017.

[29] W3C, *Web Application Manifest*, https://www.w3.org/TR/appmanifest/; *Service Workers*, https://www.w3.org/TR/service-workers/ [VERIFY W3C status of each].

[30] R. A. Eneogu, E. M. H. Mitchell, C. L. Ogbudebe, D. Aboki, V. Anyebe, C. B. Dimkpa, et al., "Iterative evaluation of mobile computer-assisted digital chest x-ray screening for TB improves efficiency, yield, and outcomes in Nigeria," *PLOS Glob. Public Health*, vol. 4, no. 1, Art. no. e0002018, 2024. [VERIFY full author list.]

---

> **Reiteration of disclaimer.** All statements about Rural MedTech AI describe a research prototype intended as a **screening aid only, not a diagnostic tool**. Accuracy figures cited from the project's own documents (`docs/MODEL_EVALUATION.md`, `README.md`, `docs/PROJECT_AUDIT.md`) are internal validation statistics, not clinical performance claims. The system requires independent professional radiological review of every image and has not been validated in a clinical setting.
