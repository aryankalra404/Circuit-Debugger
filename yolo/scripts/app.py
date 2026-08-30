"""Streamlit demo app for CircuitDoctor — YOLO + Reka dual-diagnosis."""

import os
from pathlib import Path
import tempfile

# Load .env from the yolo/ directory (parent of scripts/) before anything else
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import streamlit as st

from diagnose import DEFAULT_BASELINE, diagnose_circuit
from infer import DEFAULT_WEIGHTS
from reka_reasoner import reka_verify_circuit


def save_upload(uploaded_file) -> Path:
    """Save a Streamlit upload to a temporary image file and return its path."""
    suffix = Path(uploaded_file.name).suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(uploaded_file.getbuffer())
        return Path(tmp.name)


def show_yolo_panel(result: dict) -> None:
    """Render YOLO count-based diagnosis."""
    st.markdown("#### 🤖 YOLO Detection _(GPU, fast)_")
    st.caption("Count-based fault check — compares detected components to expected baseline.")
    st.write(result["summary"])
    if result["has_faults"]:
        st.warning(result["diagnosis_message"])
    else:
        st.success(result["diagnosis_message"])

    if result["detections"]:
        with st.expander("Raw detections"):
            for d in result["detections"]:
                bbox = d["bbox"]
                st.write(
                    f"**{d['class']}** — conf `{d['confidence']:.0%}` — "
                    f"bbox `[{bbox[0]:.0f}, {bbox[1]:.0f}, {bbox[2]:.0f}, {bbox[3]:.0f}]`"
                )


def show_reka_panel(reka: dict) -> None:
    """Render Reka visual verification results."""
    st.markdown("#### 👁️ Reka Visual Verification _(independent AI read)_")
    st.caption("Reka Flash inspects the image independently — not just trusting YOLO's count.")

    if reka.get("error"):
        st.error(f"Reka unavailable: {reka['error']}\nShowing YOLO diagnosis only.")
        return

    # Component counts
    counts = reka.get("reka_component_counts", {})
    if counts:
        cols = st.columns(3)
        cols[0].metric("LEDs seen", counts.get("led", "?"))
        cols[1].metric("Resistors seen", counts.get("resistor", "?"))
        cols[2].metric("PIR sensors seen", counts.get("pir_sensor", "?"))

    # Agreement / disagreement — the interesting demo moment
    agrees = reka.get("agrees_with_yolo")
    if agrees is True:
        st.success("✅ Reka **agrees** with YOLO's component counts.")
    elif agrees is False:
        reason = reka.get("disagreement_reason", "")
        st.warning(
            f"⚠️ Reka **disagrees** with YOLO's component counts.\n\n"
            f"**Reason:** {reason}\n\n"
            "_This disagreement is useful — it means at least one system is uncertain. "
            "Trust the more conservative count._"
        )
    else:
        st.info("Agreement with YOLO could not be determined.")

    # Visual notes
    notes = reka.get("visual_notes", "").strip()
    if notes:
        st.info(f"**Visual observations:** {notes}")

    # Final combined diagnosis
    final = reka.get("final_diagnosis", "").strip()
    if final:
        st.markdown("**Combined diagnosis:**")
        st.write(final)


def main() -> None:
    """Run the Streamlit CircuitDoctor app."""
    st.set_page_config(page_title="CircuitDoctor", layout="wide")
    st.title("🔬 CircuitDoctor")
    st.caption("YOLOv8 GPU detection + Reka AI visual verification — two independent signals.")

    reka_key_set = bool(os.environ.get("REKA_API_KEY", "").strip())
    if not reka_key_set:
        st.sidebar.warning(
            "**REKA_API_KEY not set.**\n\n"
            "Set it in your environment to enable the Reka visual verification panel.\n\n"
            "```bash\nexport REKA_API_KEY=your_key_here\n```"
        )

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

    # ── Run YOLO ────────────────────────────────────────────────────────────
    with st.spinner("Running YOLO detection…"):
        try:
            yolo_result = diagnose_circuit(
                image_path=uploaded_path,
                baseline_config_path=DEFAULT_BASELINE,
                weights_path=DEFAULT_WEIGHTS,
            )
        except Exception as exc:
            st.error(f"YOLO detection failed: {exc}")
            return

    # ── Run Reka (parallel in spirit, sequential here) ─────────────────────
    reka_result = None
    if reka_key_set:
        with st.spinner("Sending image to Reka Flash for visual verification…"):
            reka_result = reka_verify_circuit(
                image_path=uploaded_path,
                yolo_detections=yolo_result["detections"],
                diagnosis_message=yolo_result["diagnosis_message"],
            )

    # ── Images row ──────────────────────────────────────────────────────────
    img_left, img_right = st.columns(2)
    with img_left:
        st.subheader("Uploaded photo")
        st.image(str(uploaded_path), use_container_width=True)
    with img_right:
        st.subheader("YOLO annotated")
        st.image(str(yolo_result["annotated_image_path"]), use_container_width=True)

    st.divider()

    # ── Diagnosis row ────────────────────────────────────────────────────────
    if reka_result is not None:
        diag_left, diag_right = st.columns(2)
        with diag_left:
            show_yolo_panel(yolo_result)
        with diag_right:
            show_reka_panel(reka_result)
    else:
        show_yolo_panel(yolo_result)
        if not reka_key_set:
            st.info(
                "Set the **REKA_API_KEY** environment variable and restart Streamlit "
                "to enable Reka visual verification."
            )


if __name__ == "__main__":
    main()
