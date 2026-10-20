import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models
import numpy as np
import cv2
import base64

class RuralDiagnosticEngine:
    def __init__(self, model_path: str):
        self.device = torch.device("cpu") # Strictly CPU as per NFR-2
        self.model = self._load_model(model_path)
        self.feature_maps = None
        self.gradients = None
        
        # Register hooks for Grad-CAM on the LAST convolutional layer of DenseNet121
        self._register_hooks()

    def _load_model(self, model_path: str):
        # Load DenseNet121 architecture
        model = models.densenet121(weights=None)
        
        # Modify final classifier for Binary Classification
        model.classifier = nn.Linear(in_features=1024, out_features=2)
        
        try:
            # Try to load YOUR trained medical weights
            state_dict = torch.load(model_path, map_location=self.device)
            model.load_state_dict(state_dict)
            print("[OK] Custom medical weights loaded successfully.")
        except FileNotFoundError:
            # FALLBACK: If file doesn't exist, download standard ImageNet weights 
            # so the server doesn't crash and you can test the UI connection
            print("[WARN] Custom .pth file not found. Loading standard DenseNet121 weights for testing only.")
            model = models.densenet121(weights=models.DenseNet121_Weights.DEFAULT)
            model.classifier = nn.Linear(in_features=1024, out_features=2)
            
        model.eval()
        return model

    def _register_hooks(self):
        # DENSENET121 SPECIFIC: The last conv layer is the 16th layer in the 4th dense block
        target_layer = self.model.features.denseblock4.denselayer16.conv2
        
        def forward_hook(module, input, output):
            self.feature_maps = output.detach()
            
        def backward_hook(module, grad_input, grad_output):
            self.gradients = grad_output[0].detach()
            
        target_layer.register_forward_hook(forward_hook)
        target_layer.register_full_backward_hook(backward_hook)

    def predict(self, preprocessed_image: np.ndarray):
        input_tensor = torch.from_numpy(preprocessed_image).to(self.device)
        
        # Forward Pass
        output = self.model(input_tensor)
        probabilities = F.softmax(output, dim=1)
        confidence, predicted_class = torch.max(probabilities, 1)
        
        # Triage Logic
        class_idx = predicted_class.item()
        conf = confidence.item()
        risk = "Low Priority (Routine)" if class_idx == 0 else self._assign_risk(conf)
        
        return {
            "prediction": "Normal" if class_idx == 0 else "Pneumonia",
            "confidence": round(conf, 4),
            "risk_level": risk
        }

    def _assign_risk(self, confidence: float) -> str:
        if confidence > 0.75: return "High Priority (Urgent Referral)"
        if confidence > 0.40: return "Moderate Priority"
        return "Low Priority (Routine)" # Fallback for low confidence abnormalities

    def generate_gradcam(self, preprocessed_image: np.ndarray, target_class: int) -> str:
        input_tensor = torch.from_numpy(preprocessed_image).to(self.device).requires_grad_(True)
        
        # Forward pass
        output = self.model(input_tensor)
        
        # Zero gradients and backward pass for the specific class
        self.model.zero_grad()
        output[0][target_class].backward(retain_graph=True)
        
        # Global Average Pooling of gradients to get weights (alpha_k)
        pooled_gradients = torch.mean(self.gradients, dim=[0, 2, 3])
        
        # Weight the feature maps by the pooled gradients
        feature_maps = self.feature_maps.squeeze(0)
        heatmap = torch.zeros(feature_maps.shape[1:], dtype=torch.float32)
        
        for i, weight in enumerate(pooled_gradients):
            heatmap += weight * feature_maps[i]
            
        # ReLU (only keep features that positively contribute to Pneumonia)
        heatmap = F.relu(heatmap).cpu().numpy()
        
        # Normalize heatmap to 0-255 range
        heatmap = cv2.resize(heatmap, (224, 224))
        heatmap = np.maximum(heatmap, 0) / np.max(heatmap) if np.max(heatmap) > 0 else heatmap
        heatmap = np.uint8(255 * heatmap)
        
        # Apply Color Map (Jet: Blue/Cool -> Red/Warm)
        heatmap_color = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
        
        # Convert to base64 string to send easily to Next.js frontend
        _, buffer = cv2.imencode('.png', heatmap_color)
        return base64.b64encode(buffer).decode('utf-8')
