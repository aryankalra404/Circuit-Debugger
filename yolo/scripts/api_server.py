import tempfile
import sys
from pathlib import Path
from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import torch

from diagnose import diagnose_circuit
from infer import YOLO_ROOT

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
        result = diagnose_circuit(image_path=tmp_path, output_dir=OUTPUT_DIR)
        
        return {
            "detections": result["detections"],
            "counts": result["counts"],
            "summary": result["summary"],
            "diagnosis_message": result["diagnosis_message"],
            "has_faults": result["has_faults"],
            "annotated_image_filename": result["annotated_image_path"].name
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
