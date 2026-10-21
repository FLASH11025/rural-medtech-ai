# ============================================================================
# RURAL MEDTECH AI TRIAGE SYSTEM - BACKEND ENGINE
# Architecture: Component-Level (Preprocessing -> Inference -> Grad-CAM XAI)
# Model: DenseNet-121 (Optimized for CPU Edge Deployment)
# ============================================================================

import os
import io
import json
import base64
import logging
from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models
from fastapi import FastAPI, UploadFile, File, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("rural_medtech")

# ============================================================================
# DIRECTORY & FILE PATH CONSTANTS
# ============================================================================
BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "densenet121_pneumonia.pth"
DATA_DIR = BASE_DIR / "data"
HOSPITALS_PATH = DATA_DIR / "hospitals.json"
DOCTORS_PATH = DATA_DIR / "doctors.json"

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",
    "application/dicom",
    "application/octet-stream",
}

# ============================================================================
# PYDANTIC RESPONSE SCHEMAS
# ============================================================================
class HealthResponse(BaseModel):
    status: str = Field(..., description="Engine status string")
    model_loaded: bool = Field(..., description="Whether weights are actively loaded")


class ModelStatusResponse(BaseModel):
    model_loaded: bool = Field(..., description="True if trained weights are loaded")
    architecture: str = Field(..., description="Neural network architecture")
    classes: List[str] = Field(..., description="Target classification classes")
    checkpoint_path: str = Field(..., description="Path to model weights file")
    torch_version: str = Field(..., description="PyTorch runtime version")


class HospitalSchema(BaseModel):
    id: str
    name: str
    type: str
    address: str
    district: str
    state: str
    pincode: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    departments: List[str] = []
    contact: Optional[str] = None
    has_xray: bool = False
    has_ct: bool = False
    is_demo: bool = True
    last_verified: str = "2026-01-01"


class DoctorSchema(BaseModel):
    id: str
    name: str
    specialty: str
    qualifications: List[str] = []
    hospital_id: str
    hospital_name: str
    district: str
    languages: List[str] = []
    is_demo: bool = True
    last_verified: str = "2026-01-01"


class AnalysisResponse(BaseModel):
    status: str = Field("success", description="Response status (success/error)")
    prediction: str = Field(..., description="Screening classification: Normal or Pneumonia")
    model_score: float = Field(..., description="Raw uncalibrated softmax probability [0.0 - 1.0]")
    uncalibrated_confidence: float = Field(..., description="Explicitly labeled uncalibrated confidence")
    confidence: float = Field(..., description="Backward-compatible confidence value")
    is_uncertain: bool = Field(..., description="True if max softmax probability < 0.55")
    risk_level: str = Field(..., description="Clinical triage urgency level")
    heatmap_base64: Optional[str] = Field(None, description="Data URL of Grad-CAM heatmap overlay or None")
    original_base64: Optional[str] = Field(None, description="Data URL of preprocessed/decoded original image")
    model_loaded: bool = Field(True, description="Model availability flag")
    message: Optional[str] = Field(None, description="Optional diagnostic warning or error message")


# ============================================================================
# COMPONENT 1: PREPROCESSING & STANDARDIZATION MODULE
# SRS Compliance: FR-1 (Image Ingestion/Validation), NFR-2 (Hardware Efficiency)
# ============================================================================
class XRayPreprocessor:
    def __init__(self, target_size=(224, 224)):
        self.target_size = target_size
        # ImageNet standard normalization metrics required by DenseNet121
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def preprocess(self, image_bytes: bytes) -> np.ndarray:
        # 1. Decode image from bytes
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)

        if img is None:
            raise ValueError("Invalid image format or corrupted file.")

        # 2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        img_clahe = clahe.apply(img)

        # 3. Resize to standard DenseNet input grid
        img_resized = cv2.resize(img_clahe, self.target_size)

        # 4. Channel Expansion: Grayscale (1 channel) -> RGB (3 channels)
        img_3ch = cv2.cvtColor(img_resized, cv2.COLOR_GRAY2RGB)

        # 5. Normalization: Rescale to [0, 1] and apply ImageNet standard deviation
        img_float = img_3ch.astype(np.float32) / 255.0
        img_normalized = (img_float - self.mean) / self.std

        # 6. Dimension Rearrangement: (Height, Width, Channels) -> (Channels, Height, Width)
        img_tensor = np.transpose(img_normalized, (2, 0, 1))

        # Add Batch Dimension: (1, Channels, Height, Width)
        return np.expand_dims(img_tensor, axis=0)


# ============================================================================
# COMPONENT 2: MACHINE LEARNING & INFERENCE MODULE
# SRS Compliance: NFR-2 (<1.5s on 4GB RAM CPU), FR-3 (Triage Scoring)
# ============================================================================
class RuralDiagnosticEngine:
    def __init__(self, model_path: Path):
        self.device = torch.device("cpu")  # Strict CPU enforcement per NFR-2
        self.model_path = model_path
        self.model = None
        self.model_loaded = False
        self.feature_maps = None
        self.gradients = None

        self._load_model()
        if self.model_loaded:
            self._register_hooks()

    def is_ready(self) -> bool:
        return self.model_loaded and self.model is not None

    def _load_model(self):
        if not self.model_path.exists():
            logger.error(
                "Model checkpoint file not found at %s. Silent ImageNet fallback is DISABLED. "
                "Diagnostic service will return 503.",
                self.model_path,
            )
            self.model_loaded = False
            self.model = None
            return

        try:
            # Initialize DenseNet121 Architecture
            model = models.densenet121(weights=None)
            # Modify classifier head for Binary Output (Normal vs Pneumonia)
            model.classifier = nn.Linear(in_features=1024, out_features=2)

            state_dict = torch.load(str(self.model_path), map_location=self.device)
            model.load_state_dict(state_dict)
            model.eval()
            self.model = model
            self.model_loaded = True
            logger.info("Custom medical weights loaded successfully from %s", self.model_path)
        except Exception as exc:
            logger.error("Failed to load model checkpoint at %s: %s", self.model_path, exc, exc_info=True)
            self.model_loaded = False
            self.model = None

    def _register_hooks(self):
        if not self.model:
            return
        try:
            # Target the final convolutional layer of DenseNet121:
            # 16th layer of the 4th Dense Block
            target_layer = self.model.features.denseblock4.denselayer16.conv2

            def forward_hook(module, input, output):
                self.feature_maps = output.detach()

            def backward_hook(module, grad_input, grad_output):
                self.gradients = grad_output[0].detach()

            target_layer.register_forward_hook(forward_hook)
            target_layer.register_full_backward_hook(backward_hook)
            logger.info("Grad-CAM hooks successfully registered on denseblock4.denselayer16.conv2")
        except Exception as exc:
            logger.warning("Could not register Grad-CAM hooks: %s", exc)

    def predict(self, preprocessed_image: np.ndarray) -> dict:
        if not self.is_ready():
            raise RuntimeError("Diagnostic model is unavailable. Model weights are not loaded.")

        input_tensor = torch.from_numpy(preprocessed_image).to(self.device)

        # Forward Pass
        with torch.no_grad():
            output = self.model(input_tensor)

        probabilities = F.softmax(output, dim=1)
        confidence, predicted_class = torch.max(probabilities, 1)

        class_idx = int(predicted_class.item())
        conf = float(confidence.item())
        rounded_conf = round(conf, 4)

        # Uncertainty threshold: if max softmax probability < 0.55
        is_uncertain = conf < 0.55

        if class_idx == 0:
            prediction_str = "Normal"
            risk_level = "Low Priority (Routine)"
        else:
            prediction_str = "Pneumonia"
            risk_level = self._assign_risk(conf)

        return {
            "prediction": prediction_str,
            "model_score": rounded_conf,
            "uncalibrated_confidence": rounded_conf,
            "confidence": rounded_conf,
            "is_uncertain": is_uncertain,
            "risk_level": risk_level,
            "target_class": class_idx,
        }

    def _assign_risk(self, confidence: float) -> str:
        if confidence > 0.75:
            return "High Priority (Urgent Referral)"
        if confidence > 0.40:
            return "Moderate Priority"
        return "Low Priority (Routine)"

    def generate_gradcam(
        self, preprocessed_image: np.ndarray, original_image_bytes: bytes, target_class: int
    ) -> Optional[str]:
        if not self.is_ready():
            return None

        try:
            input_tensor = torch.from_numpy(preprocessed_image).to(self.device).requires_grad_(True)

            # 1. Forward pass
            output = self.model(input_tensor)
            self.model.zero_grad()

            # 2. Backward pass for target class
            output[0][target_class].backward(retain_graph=True)

            if self.gradients is None or self.feature_maps is None:
                logger.warning("Grad-CAM feature maps or gradients were not populated.")
                return None

            # 3. Global Average Pooling of gradients to calculate channel importance
            pooled_gradients = torch.mean(self.gradients, dim=[0, 2, 3])

            # 4. Weighted combination of feature maps
            feature_maps = self.feature_maps.squeeze(0)
            heatmap = torch.zeros(feature_maps.shape[1:], dtype=torch.float32)

            for i, weight in enumerate(pooled_gradients):
                heatmap += weight * feature_maps[i]

            # 5. Apply ReLU
            heatmap = F.relu(heatmap).cpu().numpy()

            # 6. Normalize heatmap to 0-255 range
            heatmap = cv2.resize(heatmap, (224, 224))
            max_val = np.max(heatmap)
            if max_val > 0:
                heatmap = np.maximum(heatmap, 0) / max_val
            heatmap = np.uint8(255 * heatmap)

            # 7. Apply Jet Color Map
            heatmap_color = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

            # 8. Clinical Overlay: 60% anatomy + 40% AI heatmap
            nparr = np.frombuffer(original_image_bytes, np.uint8)
            orig_img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            if orig_img is None:
                logger.warning("Could not decode raw image for Grad-CAM overlay blending.")
                return None

            orig_resized = cv2.resize(orig_img, (224, 224))
            orig_3ch = cv2.cvtColor(orig_resized, cv2.COLOR_GRAY2RGB)
            overlay = cv2.addWeighted(orig_3ch, 0.6, heatmap_color, 0.4, 0)

            # 9. Encode to Base64 PNG
            success, buffer = cv2.imencode(".png", overlay)
            if not success:
                logger.warning("Failed to encode Grad-CAM overlay to PNG buffer.")
                return None

            return base64.b64encode(buffer).decode("utf-8")

        except Exception as exc:
            # Never crash inference if Grad-CAM encounters an error
            logger.warning("Grad-CAM generation failed with error: %s. Returning prediction without heatmap.", exc)
            return None


# ============================================================================
# HELPER: ENCODE ORIGINAL IMAGE AS BASE64
# ============================================================================
def encode_image_as_base64(image_bytes: bytes) -> Optional[str]:
    """Encodes raw image bytes into PNG base64 string for direct frontend rendering."""
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        if img is None:
            return None
        success, buffer = cv2.imencode(".png", img)
        if not success:
            return None
        return base64.b64encode(buffer).decode("utf-8")
    except Exception as exc:
        logger.warning("Failed to encode original image as base64: %s", exc)
        return None


# ============================================================================
# DATA REPOSITORIES: HOSPITALS & DOCTORS
# ============================================================================
def load_json_records(filepath: Path) -> list:
    if not filepath.exists():
        logger.warning("Data file not found at %s. Returning empty collection.", filepath)
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.error("Error loading JSON from %s: %s", filepath, exc)
        return []


# ============================================================================
# COMPONENT 4: FASTAPI APPLICATION & ENDPOINTS
# SRS Compliance: NFR-1 (Network Independence via Localhost), NFR-3 (PII handling)
# ============================================================================
app = FastAPI(
    title="Rural MedTech AI Screening Engine",
    description="Offline-first chest X-ray screening and clinical triage system for rural healthcare",
    version="2.0.0",
)

# CORS: localhost by default; extend via ALLOWED_ORIGINS env (comma-separated),
# e.g. ALLOWED_ORIGINS=https://rural-medtech-ai.vercel.app
_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
_origins_from_env = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins_from_env or [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize singletons at module load
preprocessor = XRayPreprocessor()
diagnostic_engine = RuralDiagnosticEngine(MODEL_PATH)


# ----------------------------------------------------------------------------
# GET /health
# ----------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Endpoint to verify the local Python engine status."""
    return HealthResponse(
        status="engine_online",
        model_loaded=diagnostic_engine.is_ready(),
    )


# ----------------------------------------------------------------------------
# GET /model-status
# ----------------------------------------------------------------------------
@app.get("/model-status", response_model=ModelStatusResponse)
async def get_model_status():
    """Returns model loading availability, architecture, class labels, and PyTorch runtime."""
    return ModelStatusResponse(
        model_loaded=diagnostic_engine.is_ready(),
        architecture="DenseNet-121",
        classes=["Normal", "Pneumonia"],
        checkpoint_path=str(MODEL_PATH),
        torch_version=torch.__version__,
    )


# ----------------------------------------------------------------------------
# GET /hospitals
# ----------------------------------------------------------------------------
@app.get("/hospitals", response_model=List[HospitalSchema])
async def list_hospitals(
    q: Optional[str] = Query(None, description="Search across hospital name, address, or departments"),
    district: Optional[str] = Query(None, description="Filter by district name"),
):
    """Returns filtered rural healthcare facilities from data/hospitals.json."""
    hospitals = load_json_records(HOSPITALS_PATH)
    results = hospitals

    # Filter by District
    if district and district.strip().lower() != "all districts":
        d_query = district.strip().lower()
        # Handle Vizag / Visakhapatnam alias
        if d_query in {"vizag", "visakhapatnam"}:
            results = [
                h for h in results
                if h.get("district", "").lower() in {"visakhapatnam", "vizag"}
                or "vizag" in h.get("address", "").lower()
            ]
        else:
            results = [
                h for h in results
                if d_query in h.get("district", "").lower()
            ]

    # Filter by Free-text Query
    if q and q.strip():
        q_term = q.strip().lower()
        results = [
            h for h in results
            if (
                q_term in h.get("name", "").lower()
                or q_term in h.get("address", "").lower()
                or q_term in h.get("district", "").lower()
                or q_term in h.get("state", "").lower()
                or any(q_term in dept.lower() for dept in h.get("departments", []))
            )
        ]

    return results


# ----------------------------------------------------------------------------
# GET /doctors
# ----------------------------------------------------------------------------
@app.get("/doctors", response_model=List[DoctorSchema])
async def list_doctors(
    specialty: Optional[str] = Query(None, description="Filter by clinical specialty"),
    hospital: Optional[str] = Query(None, description="Filter by hospital ID or hospital name"),
    district: Optional[str] = Query(None, description="Filter by district"),
):
    """Returns filtered medical specialists from data/doctors.json."""
    doctors = load_json_records(DOCTORS_PATH)
    results = doctors

    # Filter by Specialty
    if specialty and specialty.strip().lower() != "all specialties":
        s_term = specialty.strip().lower()
        results = [d for d in results if s_term in d.get("specialty", "").lower()]

    # Filter by District
    if district and district.strip().lower() != "all districts":
        d_term = district.strip().lower()
        if d_term in {"vizag", "visakhapatnam"}:
            results = [
                d for d in results
                if d.get("district", "").lower() in {"visakhapatnam", "vizag"}
            ]
        else:
            results = [d for d in results if d_term in d.get("district", "").lower()]

    # Filter by Hospital
    if hospital and hospital.strip():
        h_term = hospital.strip().lower()
        results = [
            d for d in results
            if (
                h_term in d.get("hospital_id", "").lower()
                or h_term in d.get("hospital_name", "").lower()
            )
        ]

    return results


# ----------------------------------------------------------------------------
# POST /analyze-xray
# ----------------------------------------------------------------------------
@app.post("/analyze-xray", response_model=AnalysisResponse)
async def analyze_xray(file: UploadFile = File(...)):
    """Ingests a chest X-ray image, performs preprocessing, runs DenseNet-121 inference,

    and generates an explainable Grad-CAM heatmap overlay.
    """
    logger.info("Received /analyze-xray request: filename=%s, content_type=%s", file.filename, file.content_type)

    # 1. Check Model Availability (Never silently fall back to ImageNet)
    if not diagnostic_engine.is_ready():
        logger.error("Analysis rejected: Diagnostic model is not loaded.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Diagnostic model is unavailable. Model checkpoint not loaded.",
        )

    # 2. MIME Type Validation
    content_type = (file.content_type or "").lower()
    filename_lower = (file.filename or "").lower()

    is_valid_mime = content_type in ALLOWED_MIME_TYPES
    is_valid_ext = filename_lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".dcm"))

    if not (is_valid_mime or is_valid_ext):
        logger.warning("Rejected file upload with invalid format: %s (%s)", file.filename, file.content_type)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a valid JPEG, PNG, or DICOM chest X-ray image.",
        )

    # 3. Read Content and Validate File Size (Max 15MB)
    try:
        image_bytes = await file.read()
    except Exception as exc:
        logger.error("Failed to read uploaded file stream: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read uploaded file.",
        )

    if not image_bytes or len(image_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        logger.warning("File upload rejected: size %d exceeds 15MB limit.", len(image_bytes))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large ({len(image_bytes) // (1024 * 1024)}MB). Maximum allowable size is 15MB.",
        )

    # 4. Preprocessing & Corrupted File Rejection
    try:
        processed_tensor = preprocessor.preprocess(image_bytes)
    except ValueError as ve:
        logger.warning("Image preprocessing failed: %s", ve)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corrupted or invalid image file. Could not decode chest X-ray.",
        )
    except Exception as e:
        logger.error("Unexpected error during image preprocessing: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Preprocessing error: {str(e)}",
        )

    # 5. Model Inference
    try:
        results = diagnostic_engine.predict(processed_tensor)
    except Exception as e:
        logger.error("Inference execution error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Diagnostic inference error: {str(e)}",
        )

    # 6. Grad-CAM Generation (With robust fallback if it fails)
    heatmap_data_url: Optional[str] = None
    try:
        heatmap_b64 = diagnostic_engine.generate_gradcam(
            processed_tensor,
            original_image_bytes=image_bytes,
            target_class=results["target_class"],
        )
        if heatmap_b64:
            heatmap_data_url = f"data:image/png;base64,{heatmap_b64}"
    except Exception as e:
        logger.warning("Grad-CAM generation error handled gracefully: %s", e)
        heatmap_data_url = None

    # 7. Encode Original Image as Base64 for Frontend
    orig_b64 = encode_image_as_base64(image_bytes)
    orig_data_url = f"data:image/png;base64,{orig_b64}" if orig_b64 else None

    logger.info(
        "Screening complete: prediction=%s, model_score=%.4f, is_uncertain=%s, risk_level=%s",
        results["prediction"],
        results["model_score"],
        results["is_uncertain"],
        results["risk_level"],
    )

    return AnalysisResponse(
        status="success",
        prediction=results["prediction"],
        model_score=results["model_score"],
        uncalibrated_confidence=results["uncalibrated_confidence"],
        confidence=results["confidence"],
        is_uncertain=results["is_uncertain"],
        risk_level=results["risk_level"],
        heatmap_base64=heatmap_data_url,
        original_base64=orig_data_url,
        model_loaded=True,
    )


# ============================================================================
# COMPONENT 5: SINGLE-SERVICE STATIC FRONTEND (built via STATIC_EXPORT=1)
# When frontend/out exists, the engine process serves the UI and the API from
# one origin, so no CSRF/proxy layer is needed.
# ============================================================================
FRONTEND_OUT = BASE_DIR.parent / "frontend" / "out"
SPA_PAGES = ("dashboard", "hospitals", "doctors", "history")


def _page_file(page: Optional[str] = None) -> Path:
    if page:
        for candidate in (FRONTEND_OUT / page / "index.html", FRONTEND_OUT / f"{page}.html"):
            if candidate.is_file():
                return candidate
        logger.warning("Static page '%s' not found in %s, falling back to index.html.", page, FRONTEND_OUT)
    fallback = FRONTEND_OUT / "index.html"
    if not fallback.is_file():
        raise HTTPException(status_code=404, detail="Frontend bundle is missing on this deployment.")
    return fallback


if FRONTEND_OUT.is_dir():
    logger.info("Static frontend detected at %s — serving SPA from the engine.", FRONTEND_OUT)

    @app.get("/", include_in_schema=False)
    async def serve_home():
        return FileResponse(_page_file())

    for _page in SPA_PAGES:
        def _make_serve(page_name: str):
            async def _serve_page():
                return FileResponse(_page_file(page_name))
            return _serve_page

        app.get(f"/{_page}", include_in_schema=False)(_make_serve(_page))

    app.mount("/_next", StaticFiles(directory=FRONTEND_OUT / "_next"), name="next_assets")
    app.mount("/", StaticFiles(directory=FRONTEND_OUT), name="frontend_root")


# ============================================================================
# SERVER EXECUTION
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    # Strictly bind to 127.0.0.1 for local privacy and security
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
