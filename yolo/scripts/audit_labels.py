"""Audit YOLO format labels to verify dataset integrity."""

import os
from pathlib import Path

def main():
    base_dir = Path("/workspace/data/yolo")
    images_train = base_dir / "images/train"
    labels_train = base_dir / "labels/train"
    images_val = base_dir / "images/val"
    labels_val = base_dir / "labels/val"

    def check_dir(img_dir, lbl_dir):
        print(f"\n--- Checking {img_dir} ---")
        if not img_dir.exists():
            print(f"Directory {img_dir} does not exist.")
            return
        if not lbl_dir.exists():
            print(f"Directory {lbl_dir} does not exist.")
            return
            
        images = list(img_dir.glob("*.jpg")) + list(img_dir.glob("*.jpeg")) + list(img_dir.glob("*.png"))
        print(f"Found {len(images)} images.")
        
        missing_labels = []
        empty_labels = []
        
        for img in images:
            lbl_path = lbl_dir / f"{img.stem}.txt"
            if not lbl_path.exists():
                missing_labels.append(img.name)
            elif lbl_path.stat().st_size == 0:
                empty_labels.append(img.name)
                
        if missing_labels:
            print(f"⚠ Missing labels for {len(missing_labels)} images: {missing_labels[:5]}")
        if empty_labels:
            print(f"⚠ Empty labels for {len(empty_labels)} images: {empty_labels[:5]}")
            
        if not missing_labels and not empty_labels:
            print("✅ All images have non-empty label files.")

    check_dir(images_train, labels_train)
    check_dir(images_val, labels_val)

if __name__ == "__main__":
    main()
