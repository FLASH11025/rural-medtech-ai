import os
import time
import cv2
import numpy as np
import pandas as pd
from PIL import Image
from sklearn.model_selection import train_test_split
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models

# ============================================================================
# 1. FOCAL LOSS (Corrected multi-class element-wise implementation)
# ============================================================================
class FocalLoss(nn.Module):
    def __init__(self, alpha: float = 0.25, gamma: float = 2.0):
        super(FocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma

    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        CE = F.cross_entropy(inputs, targets, reduction='none')
        p_t = torch.exp(-CE)
        focal = self.alpha * (1 - p_t) ** self.gamma * CE
        return focal.mean()

# ============================================================================
# 2. CLAHE PREPROCESSING TRANSFORM (Matches Inference Preprocessor)
# ============================================================================
class ApplyCLAHE:
    """Custom PIL-compatible transform applying Contrast Limited Adaptive Histogram Equalization."""
    def __init__(self, clip_limit: float = 2.0, tile_grid_size: tuple = (8, 8)):
        self.clip_limit = clip_limit
        self.tile_grid_size = tile_grid_size

    def __call__(self, img: Image.Image) -> Image.Image:
        # Convert PIL image to grayscale numpy array
        np_img = np.array(img.convert('L'))
        clahe = cv2.createCLAHE(clipLimit=self.clip_limit, tileGridSize=self.tile_grid_size)
        enhanced = clahe.apply(np_img)
        # Convert back to PIL Image (RGB)
        return Image.fromarray(enhanced).convert('RGB')

# ============================================================================
# 3. CUSTOM DATASET
# ============================================================================
class IndianaChestDataset(Dataset):
    def __init__(self, dataframe: pd.DataFrame, img_dir: str, transform=None):
        self.dataframe = dataframe
        self.img_dir = img_dir
        self.transform = transform

    def __len__(self):
        return len(self.dataframe)

    def __getitem__(self, idx: int):
        img_name = os.path.join(self.img_dir, self.dataframe.iloc[idx]['filename'])
        image = Image.open(img_name).convert('RGB')
        label = int(self.dataframe.iloc[idx]['label'])
        if self.transform:
            image = self.transform(image)
        return image, label

# ============================================================================
# 4. DATA PREPARATION
# ============================================================================
def main():
    print("Loading and parsing CSV data...")
    PROJECTIONS_CSV = '../dataset/indiana_projections.csv'
    REPORTS_CSV = '../dataset/indiana_reports.csv'
    IMAGE_DIR = '../dataset/images/'

    proj_df = pd.read_csv(PROJECTIONS_CSV)
    repo_df = pd.read_csv(REPORTS_CSV)
    merged_df = pd.merge(proj_df, repo_df, on='uid')
    merged_df = merged_df[merged_df['projection'] == 'Frontal']

    def map_label(problem_text):
        if pd.isna(problem_text):
            return 1
        if "normal" in str(problem_text).lower().strip():
            return 0
        return 1

    merged_df['label'] = merged_df['Problems'].apply(map_label)

    print(f"Total Frontal Images Found: {len(merged_df)}")
    print(f"Normal Cases: {len(merged_df[merged_df['label'] == 0])}")
    print(f"Abnormal Cases: {len(merged_df[merged_df['label'] == 1])}")

    train_df, val_df = train_test_split(
        merged_df,
        test_size=0.2,
        random_state=42,
        stratify=merged_df['label']
    )

    # ========================================================================
    # 5. TRANSFORMS (Corrected: includes CLAHE matching inference pipeline)
    # ========================================================================
    train_transform = transforms.Compose([
        ApplyCLAHE(clip_limit=2.0, tile_grid_size=(8, 8)),
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    val_transform = transforms.Compose([
        ApplyCLAHE(clip_limit=2.0, tile_grid_size=(8, 8)),
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    train_dataset = IndianaChestDataset(train_df, IMAGE_DIR, transform=train_transform)
    val_dataset = IndianaChestDataset(val_df, IMAGE_DIR, transform=val_transform)

    train_loader = DataLoader(train_dataset, batch_size=8, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=8, shuffle=False, num_workers=0)

    # ========================================================================
    # 6. MODEL SETUP — FREEZE FEATURES, ONLY TRAIN CLASSIFIER
    # ========================================================================
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nUsing device: {device}")

    model = models.densenet121(weights=models.DenseNet121_Weights.DEFAULT)

    # Freeze all feature layers — only train the classifier head
    for param in model.features.parameters():
        param.requires_grad = False

    model.classifier = nn.Linear(in_features=1024, out_features=2)
    model = model.to(device)

    criterion = FocalLoss()
    optimizer = optim.Adam(model.classifier.parameters(), lr=0.001)

    # ========================================================================
    # 7. TRAINING LOOP
    # ========================================================================
    epochs = 3
    best_val_accuracy = 0.0

    print(f"\nStarting training ({epochs} epochs, classifier-only)...")
    total_start = time.time()

    for epoch in range(epochs):
        epoch_start = time.time()
        model.train()
        running_loss = 0.0
        batch_count = 0

        for inputs, labels in train_loader:
            inputs, labels = inputs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
            batch_count += 1

        # Validation
        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for inputs, labels in val_loader:
                inputs, labels = inputs.to(device), labels.to(device)
                outputs = model(inputs)
                _, predicted = torch.max(outputs.data, 1)
                total += labels.size(0)
                correct += (predicted == labels).sum().item()

        val_accuracy = 100 * correct / total
        epoch_time = time.time() - epoch_start
        print(f"Epoch {epoch+1}/{epochs} | Loss: {running_loss/batch_count:.4f} | Val Acc: {val_accuracy:.2f}% | Time: {epoch_time:.0f}s")

        if val_accuracy > best_val_accuracy:
            best_val_accuracy = val_accuracy
            os.makedirs('models', exist_ok=True)
            torch.save(model.state_dict(), 'models/densenet121_pneumonia.pth')
            print(f"  -> Saved new best model ({val_accuracy:.2f}%)")

    total_time = time.time() - total_start
    print(f"\nTraining Complete! Total: {total_time:.0f}s | Best Val Acc: {best_val_accuracy:.2f}%")


if __name__ == "__main__":
    main()
