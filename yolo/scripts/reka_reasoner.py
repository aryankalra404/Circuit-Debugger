"""Reka AI visual verification layer for CircuitDoctor.

Sends the circuit photo + YOLO's preliminary detection summary to Reka Flash
so it can do its own independent visual count and cross-check the YOLO result.
"""

import base64
import json
import os
import sys
from pathlib import Path


REKA_API_BASE = os.environ.get("REKA_API_BASE", "https://api.reka.ai/v1")
REKA_MODEL = os.environ.get("REKA_MODEL", "qwen3.6-flash")
REKA_TIMEOUT = 30  # seconds — keep it fast for a live demo

SYSTEM_PROMPT = """\
You are an expert electrical engineer acting as the visual reasoning engine for 'CircuitDoctor'.
Your job is to inspect a photo or video of a circuit and provide a final, authoritative diagnosis.
You will be provided with a preliminary component count, but your visual inspection is the final word.

Focus on:
1. Verifying the exact count of LEDs, resistors, and PIR sensors.
2. Checking if the wiring is logically correct and physically secure.
3. Identifying any obvious faults (e.g., missing resistor, LED plugged in backward, loose wire).

You must respond ONLY with a raw JSON object (no markdown, no backticks).
Your JSON MUST exactly match this schema:
{
  "reka_led_count": int,
  "reka_resistor_count": int,
  "reka_pir_count": int,
  "visual_notes": "A brief, professional observation of the wiring and physical connections.",
  "final_diagnosis": "The complete, authoritative diagnosis of the circuit. Do not mention 'YOLO', 'the detector', or any internal systems. Speak directly to the user about their circuit."
}
"""


def _build_yolo_context(yolo_detections: list[dict]) -> str:
    """Format YOLO detections into a concise human-readable summary."""
    if not yolo_detections:
        return "YOLO detected NO components (0 LEDs, 0 resistors, 0 PIR sensors)."

    from collections import Counter
    counts = Counter(d["class"] for d in yolo_detections)
    conf_by_class: dict[str, list[float]] = {}
    for d in yolo_detections:
        conf_by_class.setdefault(d["class"], []).append(d["confidence"])

    lines = ["YOLO preliminary counts (may be inaccurate — verify against the image):"]
    for cls, cnt in sorted(counts.items()):
        avg_conf = sum(conf_by_class[cls]) / len(conf_by_class[cls])
        lines.append(f"  • {cls}: {cnt} detected, avg confidence {avg_conf:.0%}")
    return "\n".join(lines)


def _encode_media(file_path: Path) -> tuple[str, str, str]:
    """Return (base64_data, media_type, category) for an image or video file."""
    suffix = file_path.suffix.lower()
    image_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                 ".png": "image/png", ".webp": "image/webp"}
    video_map = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/mp4"}
    
    if suffix in image_map:
        media_type = image_map[suffix]
        category = "image_url"
    elif suffix in video_map:
        media_type = video_map[suffix]
        category = "video_url"
    else:
        # Default to image/jpeg if unknown
        media_type = "image/jpeg"
        category = "image_url"

    with file_path.open("rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return b64, media_type, category


def reka_verify_circuit(
    image_path: str | Path,
    yolo_detections: list[dict],
    diagnosis_message: str,
) -> dict:
    """Send image/video + YOLO context to Reka Flash for independent visual verification."""
    api_key = os.environ.get("REKA_API_KEY", "").strip()
    if not api_key:
        return _fallback("REKA_API_KEY environment variable is not set.")

    image_path = Path(image_path)
    if not image_path.exists():
        return _fallback(f"Media not found: {image_path}")

    try:
        import httpx
    except ImportError:
        return _fallback("httpx not installed — run: pip install httpx")

    try:
        b64_data, media_type, category = _encode_media(image_path)
    except Exception as exc:
        return _fallback(f"Failed to encode media: {exc}")

    yolo_context = _build_yolo_context(yolo_detections)
    user_message = (
        f"Preliminary component count context:\n{yolo_context}\n\n"
        f"Preliminary diagnosis context: {diagnosis_message}\n\n"
        "Please inspect the circuit media. Verify the count of LEDs, resistors, "
        "and PIR sensors. Check whether the wiring is correct (all components connected properly). "
        "Note any visible wiring concerns. "
        "Write the final, authoritative diagnosis directly for the user."
        "Return ONLY a raw JSON object matching the schema in your system prompt."
    )

    payload = {
        "model": REKA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": category,
                        category: {
                            "url": f"data:{media_type};base64,{b64_data}"
                        },
                    },
                    {"type": "text", "text": user_message},
                ],
            },
        ],
        "max_tokens": 512,
        "temperature": 0.1,  # low temp for consistent structured output
    }

    try:
        with httpx.Client(timeout=REKA_TIMEOUT) as client:
            response = client.post(
                f"{REKA_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code == 401:
            return _fallback("Reka API authentication failed — check your REKA_API_KEY.")
        if response.status_code == 429:
            return _fallback("Reka API rate limit hit — try again in a moment.")
        if response.status_code != 200:
            return _fallback(f"Reka API returned HTTP {response.status_code}: {response.text[:200]}")

        raw_text = response.json()["choices"][0]["message"]["content"].strip()
        return _parse_reka_response(raw_text, yolo_detections)

    except httpx.TimeoutException:
        return _fallback(f"Reka API timed out after {REKA_TIMEOUT}s.")
    except httpx.ConnectError:
        return _fallback("Could not connect to Reka API — check network.")
    except Exception as exc:
        return _fallback(f"Unexpected error calling Reka API: {exc}")


def _parse_reka_response(raw_text: str, yolo_detections: list[dict]) -> dict:
    """Parse Reka's JSON response into a structured dict."""
    # Strip markdown code fences if Reka included them despite instructions
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Reka didn't return valid JSON — wrap raw text as final_diagnosis
        return {
            "reka_component_counts": {},
            "agrees_with_yolo": None,
            "disagreement_reason": "Could not parse Reka response as JSON.",
            "visual_notes": "",
            "final_diagnosis": raw_text,
            "raw_response": raw_text,
            "error": None,
        }

    from collections import Counter
    yolo_counts = dict(Counter(d["class"] for d in yolo_detections))

    return {
        "reka_component_counts": {
            "led": data.get("reka_led_count", 0),
            "resistor": data.get("reka_resistor_count", 0),
            "pir_sensor": data.get("reka_pir_count", 0),
        },
        "agrees_with_yolo": bool(data.get("agrees_with_yolo", False)),
        "disagreement_reason": data.get("disagreement_reason", ""),
        "visual_notes": data.get("visual_notes", ""),
        "final_diagnosis": data.get("final_diagnosis", ""),
        "raw_response": raw_text,
        "error": None,
    }


def _fallback(reason: str) -> dict:
    """Return a structured fallback dict when Reka cannot be reached."""
    print(f"[reka_reasoner] Fallback: {reason}", file=sys.stderr)
    return {
        "reka_component_counts": {},
        "agrees_with_yolo": None,
        "disagreement_reason": "",
        "visual_notes": "",
        "final_diagnosis": "",
        "raw_response": "",
        "error": reason,
    }
