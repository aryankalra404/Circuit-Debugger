"""Streamlit demo app for CircuitDoctor."""

from pathlib import Path
import tempfile

import streamlit as st

from diagnose import DEFAULT_BASELINE, DEFAULT_WEIGHTS, diagnose_circuit


def save_upload(uploaded_file) -> Path:
    """Save a Streamlit upload to a temporary image file and return its path."""
    suffix = Path(uploaded_file.name).suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(uploaded_file.getbuffer())
        return Path(tmp.name)


def show_results(uploaded_path: Path, result: dict) -> None:
    """Render uploaded and annotated images plus diagnosis text."""
    left, right = st.columns(2)
    with left:
        st.subheader("Uploaded photo")
        st.image(str(uploaded_path), use_container_width=True)
    with right:
        st.subheader("Detections")
        st.image(str(result["annotated_image_path"]), use_container_width=True)

    st.write(result["summary"])
    if result["has_faults"]:
        st.warning(result["diagnosis_message"])
    else:
        st.success(result["diagnosis_message"])


def main() -> None:
    """Run the Streamlit CircuitDoctor app."""
    st.set_page_config(page_title="CircuitDoctor", layout="wide")
    st.title("CircuitDoctor")
    st.caption("YOLOv8 circuit component check for the DevJams MVP.")

    uploaded_file = st.file_uploader(
        "Upload a circuit photo",
        type=["jpg", "jpeg", "png"],
    )

    if uploaded_file is None:
        st.info("Upload a breadboard photo to run detection.")
        return

    if not Path(DEFAULT_WEIGHTS).exists():
        st.error(f"Model weights not found at {DEFAULT_WEIGHTS}")
        return

    uploaded_path = save_upload(uploaded_file)

    with st.spinner("Inspecting circuit..."):
        try:
            result = diagnose_circuit(
                image_path=uploaded_path,
                baseline_config_path=DEFAULT_BASELINE,
                weights_path=DEFAULT_WEIGHTS,
            )
        except Exception as exc:
            st.error(f"Could not diagnose image: {exc}")
            return

    show_results(uploaded_path, result)


if __name__ == "__main__":
    main()
