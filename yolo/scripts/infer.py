"""Run YOLOv8 inference for CircuitDoctor images."""

import argparse
import os
import sys
from pathlib import Path

import cv2
from ultralytics import YOLO


# Derive YOLO_ROOT from the script's own location so this works both locally
# (yolo/scripts/ → yolo/) and inside Docker (/workspace/scripts/ → /workspace/).
# Override by setting the YOLO_ROOT environment variable.
_SCRIPTS_DIR = Path(__file__).resolve().parent
YOLO_ROOT = Path(os.environ.get("YOLO_ROOT", str(_SCRIPTS_DIR.parent)))

DEFAULT_WEIGHTS = YOLO_ROOT / "runs" / "circuitdoctor_v2" / "weights" / "best.pt"
DEFAULT_OUTPUT_DIR = YOLO_ROOT / "runs" / "inference"


def load_model(weights_path: str | Path) -> YOLO:
    """Load a YOLO model from disk after validating the weights path."""
    weights = Path(weights_path)
    if not weights.exists():
        print(f"WARNING: Weights not found at {weights}. Falling back to default yolov8n.pt for local testing.", file=sys.stderr)
        return YOLO("yolov8n.pt")

    return YOLO(str(weights))


def run_inference(
    image_path: str | Path,
    weights_path: str | Path = DEFAULT_WEIGHTS,
    output_dir: str | Path = DEFAULT_OUTPUT_DIR,
    conf: float = 0.05,
) -> tuple[list[dict], Path]:
    """Run YOLO inference and save an annotated image."""
    image = Path(image_path)
    if not image.exists():
        raise FileNotFoundError(f"Image not found at {image}")

    model = load_model(weights_path)
    results = model.predict(source=str(image), conf=conf, verbose=False)
    result = results[0]

    detections = extract_detections(result)
    output_path = save_annotated_image(result, image, output_dir)
    return detections, output_path


def extract_detections(result) -> list[dict]:
    """Convert one Ultralytics result object into simple detection dictionaries."""
    detections = []
    names = result.names

    for box in result.boxes:
        class_id = int(box.cls[0].item())
        confidence = float(box.conf[0].item())
        xyxy = [round(float(value), 2) for value in box.xyxy[0].tolist()]
        detections.append(
            {
                "class": names[class_id],
                "confidence": confidence,
                "bbox": xyxy,
            }
        )

    return detections


def save_annotated_image(result, image_path: Path, output_dir: str | Path) -> Path:
    """Save Ultralytics' annotated image plot and return its output path."""
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    output_path = output / f"{image_path.stem}_annotated{image_path.suffix}"
    annotated = result.plot()
    cv2.imwrite(str(output_path), annotated)
    return output_path


def print_detections(detections: list[dict]) -> None:
    """Print detections in a readable command-line format."""
    if not detections:
        print("No detections found.")
        return

    for detection in detections:
        bbox = detection["bbox"]
        print(
            f"{detection['class']}: confidence={detection['confidence']:.2f}, "
            f"bbox=[{bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}]"
        )


def parse_args() -> argparse.Namespace:
    """Parse inference command-line arguments."""
    parser = argparse.ArgumentParser(description="Run CircuitDoctor YOLO inference.")
    parser.add_argument("--image", required=True, help="Path to a circuit image.")
    parser.add_argument(
        "--weights",
        default=str(DEFAULT_WEIGHTS),
        help="Path to trained YOLO weights.",
    )
    return parser.parse_args()


def main() -> int:
    """Run inference from the command line."""
    args = parse_args()

    try:
        detections, output_path = run_inference(args.image, args.weights)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print_detections(detections)
    print(f"Annotated image saved to: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
