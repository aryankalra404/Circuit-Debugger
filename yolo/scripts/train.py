"""Train YOLOv8n for CircuitDoctor using the local LabelImg YOLO dataset."""

import argparse
import sys
from pathlib import Path

from ultralytics import YOLO


DEFAULT_DATA_YAML = Path("/workspace/data/yolo/data.yaml")


def train_model(data_yaml: Path, epochs: int, batch: int, imgsz: int) -> None:
    """Train YOLOv8n using a local YOLO data.yaml file."""
    if not data_yaml.exists():
        raise FileNotFoundError(f"Dataset yaml not found at {data_yaml}")

    model = YOLO("yolov8n.pt")
    model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=0,
        patience=40,
        project="/workspace/runs",
        name="circuitdoctor_v2",
        degrees=15.0,
        hsv_h=0.015,
        hsv_s=0.4,
        hsv_v=0.4,
        scale=0.1,
        fliplr=0.5,
    )


def parse_args() -> argparse.Namespace:
    """Parse training command-line arguments."""
    parser = argparse.ArgumentParser(description="Train CircuitDoctor YOLOv8n.")
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs.")
    parser.add_argument("--batch", type=int, default=16, help="Training batch size.")
    parser.add_argument("--imgsz", type=int, default=640, help="Training image size.")
    parser.add_argument(
        "--data",
        default=str(DEFAULT_DATA_YAML),
        help="Path to the local YOLO data.yaml file.",
    )
    return parser.parse_args()


def main() -> int:
    """Validate the local dataset path and start training."""
    args = parse_args()

    try:
        data_yaml = Path(args.data)
        train_model(data_yaml, epochs=args.epochs, batch=args.batch, imgsz=args.imgsz)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
