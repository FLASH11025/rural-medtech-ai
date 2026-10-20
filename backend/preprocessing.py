import cv2
import numpy as np

class XRayPreprocessor:
    def __init__(self, target_size=(224, 224)):
        self.target_size = target_size
        # ImageNet mean/std for MobileNetV2
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def preprocess(self, image_bytes: bytes) -> np.ndarray:
        # 1. Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        
        if img is None:
            raise ValueError("Invalid image format")

        # 2. CLAHE (Contrast Enhancement for subtle lung opacities)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        img_clahe = clahe.apply(img)

        # 3. Resize to 224x224
        img_resized = cv2.resize(img_clahe, self.target_size)

        # 4. Convert Grayscale to 3-channel (MobileNetV2 requirement)
        img_3ch = cv2.cvtColor(img_resized, cv2.COLOR_GRAY2RGB)

        # 5. Normalize to [0, 1] then apply ImageNet stats
        img_float = img_3ch.astype(np.float32) / 255.0
        img_normalized = (img_float - self.mean) / self.std

        # 6. Rearrange dimensions for PyTorch: (Channels, Height, Width)
        img_tensor = np.transpose(img_normalized, (2, 0, 1))
        
        # Add batch dimension: (1, Channels, Height, Width)
        return np.expand_dims(img_tensor, axis=0)
