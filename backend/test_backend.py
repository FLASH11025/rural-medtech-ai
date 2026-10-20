"""
Automated Test Suite for Rural MedTech AI Backend
Validates endpoints, preprocessing, model inference, Grad-CAM, file validations, and directory search.
"""

import os
import io
import unittest
from pathlib import Path
import numpy as np
import cv2
import torch
from fastapi.testclient import TestClient

from main import (
    app,
    preprocessor,
    diagnostic_engine,
    MAX_FILE_SIZE_BYTES,
    XRayPreprocessor,
    RuralDiagnosticEngine,
    MODEL_PATH,
)

class TestRuralMedTechBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.sample_image_path = Path(__file__).resolve().parent.parent / "dataset" / "images" / "1000_IM-0003-1001.dcm.png"

    def test_health_check(self):
        """Test GET /health returns engine_online and model status."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "engine_online")
        self.assertTrue(data["model_loaded"])

    def test_model_status(self):
        """Test GET /model-status returns correct architecture and classes."""
        response = self.client.get("/model-status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["model_loaded"])
        self.assertEqual(data["architecture"], "DenseNet-121")
        self.assertEqual(data["classes"], ["Normal", "Pneumonia"])
        self.assertIn("torch_version", data)

    def test_list_hospitals_all(self):
        """Test GET /hospitals returns 30 records."""
        response = self.client.get("/hospitals")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 30)
        # Verify schema
        first = data[0]
        self.assertIn("id", first)
        self.assertIn("name", first)
        self.assertIn("district", first)
        self.assertIn("has_xray", first)

    def test_list_hospitals_filter_district(self):
        """Test filtering hospitals by district."""
        response = self.client.get("/hospitals?district=Nellore")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)
        for h in data:
            self.assertEqual(h["district"].lower(), "nellore")

    def test_list_hospitals_search_query(self):
        """Test searching hospitals by text."""
        response = self.client.get("/hospitals?q=General")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)

    def test_list_doctors_all(self):
        """Test GET /doctors returns 25 records."""
        response = self.client.get("/doctors")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 25)
        first = data[0]
        self.assertIn("id", first)
        self.assertIn("specialty", first)
        self.assertIn("hospital_name", first)

    def test_list_doctors_filter_specialty(self):
        """Test filtering doctors by specialty."""
        response = self.client.get("/doctors?specialty=Pulmonology")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)
        for d in data:
            self.assertIn("pulmonology", d["specialty"].lower())

    def test_preprocessing_output_shape_and_range(self):
        """Verify XRayPreprocessor outputs (1, 3, 224, 224) normalized tensor."""
        # Create a synthetic 100x100 grayscale image
        synthetic_img = np.random.randint(0, 255, (100, 100), dtype=np.uint8)
        _, buf = cv2.imencode(".png", synthetic_img)
        tensor = preprocessor.preprocess(buf.tobytes())
        self.assertEqual(tensor.shape, (1, 3, 224, 224))
        self.assertEqual(tensor.dtype, np.float32)

    def test_valid_image_inference_and_gradcam(self):
        """Test uploading a legitimate X-ray returns 200, valid prediction, score, and heatmap."""
        if not self.sample_image_path.exists():
            self.skipTest(f"Sample image not found at {self.sample_image_path}")

        with open(self.sample_image_path, "rb") as f:
            files = {"file": ("test_xray.png", f, "image/png")}
            response = self.client.post("/analyze-xray", files=files)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn(data["prediction"], ["Normal", "Pneumonia"])
        self.assertGreaterEqual(data["model_score"], 0.0)
        self.assertLessEqual(data["model_score"], 1.0)
        self.assertIsInstance(data["is_uncertain"], bool)
        self.assertIn("Priority", data["risk_level"])
        self.assertIsNotNone(data["heatmap_base64"])
        self.assertTrue(data["heatmap_base64"].startswith("data:image/png;base64,"))
        self.assertIsNotNone(data["original_base64"])
        self.assertTrue(data["original_base64"].startswith("data:image/png;base64,"))

    def test_reject_invalid_extension(self):
        """Test uploading an unsupported file format (.txt or .pdf) is rejected."""
        dummy_content = b"This is a text file, not a chest X-ray."
        files = {"file": ("notes.txt", io.BytesIO(dummy_content), "text/plain")}
        response = self.client.post("/analyze-xray", files=files)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported file format", response.json()["detail"])

    def test_reject_empty_file(self):
        """Test uploading an empty file is rejected."""
        files = {"file": ("empty.png", io.BytesIO(b""), "image/png")}
        response = self.client.post("/analyze-xray", files=files)
        self.assertEqual(response.status_code, 400)
        self.assertIn("empty", response.json()["detail"].lower())

    def test_reject_corrupted_image(self):
        """Test uploading random non-image bytes disguised as .png is rejected."""
        corrupted_bytes = b"\x89PNG\r\n\x1a\nCorruptedGarbageData1234567890"
        files = {"file": ("corrupted.png", io.BytesIO(corrupted_bytes), "image/png")}
        response = self.client.post("/analyze-xray", files=files)
        self.assertEqual(response.status_code, 400)
        self.assertIn("corrupted", response.json()["detail"].lower())

    def test_reject_oversized_file(self):
        """Test uploading a file > 15MB is rejected."""
        # 16 MB dummy buffer
        oversized = b"\xff\xd8\xff" + b"0" * (16 * 1024 * 1024)
        files = {"file": ("large.jpg", io.BytesIO(oversized), "image/jpeg")}
        response = self.client.post("/analyze-xray", files=files)
        self.assertEqual(response.status_code, 400)
        self.assertIn("too large", response.json()["detail"].lower())

if __name__ == "__main__":
    unittest.main()
