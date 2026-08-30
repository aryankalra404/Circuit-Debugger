"""Diagnose simple CircuitDoctor faults from YOLO detection counts."""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from infer import DEFAULT_WEIGHTS, YOLO_ROOT, run_inference


DEFAULT_BASELINE = {"led": 3, "resistor": 3, "pir_sensor": 1}
DEFAULT_BASELINE_PATH = YOLO_ROOT / "baseline_config.json"
DEFAULT_DIAGNOSIS_OUTPUT_DIR = YOLO_ROOT / "runs" / "inference"
NO_FAULTS_MESSAGE = "No faults detected — circuit appears correctly assembled."


def load_baseline_config(config: str | Path | dict | None = None) -> dict[str, int]:
    """Load expected component counts from a dict, JSON file, or default config."""
    if config is None:
        config_path = DEFAULT_BASELINE_PATH
        if config_path.exists():
            return load_baseline_config(config_path)
        return DEFAULT_BASELINE.copy()

    if isinstance(config, dict):
        return {str(key): int(value) for key, value in config.items()}

    config_path = Path(config)
    if not config_path.exists():
        raise FileNotFoundError(f"Baseline config not found at {config_path}")

    with config_path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, dict):
        raise ValueError("Baseline config must be a JSON object of class counts.")

    return {str(key): int(value) for key, value in data.items()}


def count_detections(detections: list[dict]) -> dict[str, int]:
    """Count detections by class name."""
    counts = Counter(detection["class"] for detection in detections)
    return dict(sorted(counts.items()))


def format_detection_summary(counts: dict[str, int]) -> str:
    """Format raw detection counts as readable text."""
    if not counts:
        return "Detection summary: no components detected."

    parts = [f"{name}: {count}" for name, count in counts.items()]
    return "Detection summary: " + ", ".join(parts)


def diagnose_counts(actual: dict[str, int], expected: dict[str, int]) -> list[str]:
    """Compare actual and expected counts and return diagnosis messages."""
    messages = []

    for class_name, expected_count in expected.items():
        actual_count = actual.get(class_name, 0)
        if actual_count == expected_count:
            continue

        display_name = format_class_name(class_name, expected_count)
        if class_name == "pir_sensor" and actual_count < expected_count:
            messages.append(
                f"Expected {expected_count} {display_name}, detected {actual_count} — "
                "sensor may be disconnected or misdetected."
            )
        elif class_name == "led" and actual_count < expected_count:
            messages.append(
                f"Expected {expected_count} {display_name}, detected {actual_count} — "
                "possible missing or disconnected LED."
            )
        elif actual_count < expected_count:
            messages.append(
                f"Expected {expected_count} {display_name}, detected {actual_count} — "
                f"possible missing {class_name.replace('_', ' ')}."
            )
        else:
            messages.append(
                f"Expected {expected_count} {display_name}, detected {actual_count} — "
                f"extra {class_name.replace('_', ' ')} may be present or misdetected."
            )

    if not messages:
        messages.append(NO_FAULTS_MESSAGE)

    return messages


def format_class_name(class_name: str, count: int) -> str:
    """Return a human-friendly component name with simple plural handling."""
    if class_name == "led":
        return "LED" if count == 1 else "LEDs"
    if class_name == "pir_sensor":
        return "PIR sensor" if count == 1 else "PIR sensors"
    if class_name == "resistor":
        return "resistor" if count == 1 else "resistors"
    return class_name.replace("_", " ")


def diagnose_circuit(
    image_path: str | Path,
    baseline_config_path: str | Path | dict | None = None,
    weights_path: str | Path = DEFAULT_WEIGHTS,
    output_dir: str | Path = DEFAULT_DIAGNOSIS_OUTPUT_DIR,
) -> dict:
    """Diagnose a circuit image by comparing YOLO counts to baseline counts."""
    baseline = load_baseline_config(baseline_config_path)
    detections, annotated_path = run_inference(
        image_path=image_path,
        weights_path=weights_path,
        output_dir=output_dir,
    )
    counts = count_detections(detections)
    messages = diagnose_counts(counts, baseline)

    return {
        "detections": detections,
        "counts": counts,
        "summary": format_detection_summary(counts),
        "diagnosis_message": "\n".join(messages),
        "has_faults": not (len(messages) == 1 and messages[0] == NO_FAULTS_MESSAGE),
        "annotated_image_path": annotated_path,
    }


def diagnose_image(
    image_path: str | Path,
    baseline_config_path: str | Path | dict | None = None,
    weights_path: str | Path = DEFAULT_WEIGHTS,
    output_dir: str | Path = DEFAULT_DIAGNOSIS_OUTPUT_DIR,
) -> dict:
    """Backward-compatible wrapper for diagnose_circuit."""
    return diagnose_circuit(
        image_path=image_path,
        baseline_config_path=baseline_config_path,
        weights_path=weights_path,
        output_dir=output_dir,
    )


def parse_args() -> argparse.Namespace:
    """Parse diagnosis command-line arguments."""
    parser = argparse.ArgumentParser(description="Diagnose CircuitDoctor faults.")
    parser.add_argument("--image", required=True, help="Path to a circuit image.")
    parser.add_argument(
        "--weights",
        default=str(DEFAULT_WEIGHTS),
        help="Path to trained YOLO weights.",
    )
    parser.add_argument(
        "--baseline",
        default=None,
        help="Path to baseline_config.json. Defaults to /workspace/baseline_config.json.",
    )
    return parser.parse_args()


def main() -> int:
    """Run circuit diagnosis from the command line."""
    args = parse_args()

    try:
        result = diagnose_circuit(args.image, args.baseline, args.weights)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(result["summary"])
    print(result["diagnosis_message"])
    print(f"Annotated image saved to: {result['annotated_image_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
