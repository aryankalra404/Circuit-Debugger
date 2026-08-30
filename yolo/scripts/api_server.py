"""FastAPI server for CircuitDoctor — YOLO + Reka dual-diagnosis."""

import tempfile
from pathlib import Path

# Load .env from the yolo/ directory (parent of scripts/) before anything else
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import torch
import uvicorn
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from diagnose import diagnose_circuit
from infer import YOLO_ROOT
from reka_reasoner import reka_verify_circuit

app = FastAPI(title="CircuitDoctor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = YOLO_ROOT / "runs" / "inference"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(OUTPUT_DIR)), name="static")


@app.get("/health")
def health_check():
    return {"status": "ok", "gpu_available": torch.cuda.is_available()}


@app.post("/diagnose")
async def diagnose_endpoint(photo: UploadFile = File(...)):
    suffix = Path(photo.filename).suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await photo.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        # ── Step 1: YOLO fast count-based diagnosis ──────────────────────────
        yolo = diagnose_circuit(image_path=tmp_path, output_dir=OUTPUT_DIR)

        # ── Step 2: Reka independent visual verification ─────────────────────
        reka = reka_verify_circuit(
            image_path=tmp_path,
            yolo_detections=yolo["detections"],
            diagnosis_message=yolo["diagnosis_message"],
        )

        return {
            # YOLO fields (unchanged shape — Next.js route still works)
            "detections": yolo["detections"],
            "counts": yolo["counts"],
            "summary": yolo["summary"],
            "diagnosis_message": yolo["diagnosis_message"],
            "has_faults": yolo["has_faults"],
            "annotated_image_filename": yolo["annotated_image_path"].name,
            # Reka fields (new — Next.js route can ignore or display these)
            "reka": {
                "component_counts": reka["reka_component_counts"],
                "agrees_with_yolo": reka["agrees_with_yolo"],
                "disagreement_reason": reka["disagreement_reason"],
                "visual_notes": reka["visual_notes"],
                "final_diagnosis": reka["final_diagnosis"],
                "error": reka["error"],
            },
        }

    except Exception as exc:
        return {"error": str(exc)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
