"""Verify that PyTorch can see an NVIDIA GPU."""

import sys

import torch


def check_gpu() -> str:
    """Return the active CUDA device name or exit with a clear error."""
    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA GPU is not available. Start the NVIDIA container with GPU access "
            "and verify that PyTorch can see CUDA."
        )

    return torch.cuda.get_device_name(0)


def main() -> int:
    """Run the GPU check from the command line."""
    try:
        device_name = check_gpu()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"GPU available: {device_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
