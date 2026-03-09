from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os
import httpx
import json

# Ollama base URL — override via env var for local dev vs Docker
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")

app = FastAPI(title="CorelDRAW File Analysis API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # open for Docker / Oracle deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Request / Response models ────────────────────────────────────────────────

class FileSummary(BaseModel):
    filename: str
    version: str
    pages: int
    width_inches: float
    height_inches: float
    width_feet: float
    height_feet: float
    compatible: bool
    needs_eyelids: bool
    dimension_mismatch: bool
    filename_dims: Optional[str] = None
    metadata_dims: Optional[str] = None


class AnalyzeRequest(BaseModel):
    filename: str
    metadata_dims: str          # e.g. "5.00x3.00"
    page_count: int


class AiAnalysisResult(BaseModel):
    dims: str
    material: str
    total_qty: str
    eyelids: bool
    substrate: str
    lamination: str
    alerts: list[str]


# ── In-memory store ──────────────────────────────────────────────────────────

summaries_store: list[dict] = []


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "CorelDRAW File Analysis API", "status": "running", "version": "2.0.0"}


@app.post("/api/summary")
async def receive_summary(summary: FileSummary):
    """Accept a lightweight JSON summary of a processed CDR file."""
    record = summary.model_dump()
    summaries_store.append(record)
    return {
        "status": "received",
        "message": f"Summary for '{summary.filename}' stored successfully.",
        "id": len(summaries_store) - 1,
    }


@app.get("/api/summaries")
async def get_summaries():
    """Return all stored file summaries."""
    return {"count": len(summaries_store), "summaries": summaries_store}


@app.post("/api/analyze", response_model=AiAnalysisResult)
async def analyze_file(req: AnalyzeRequest):
    """
    Send file metadata to Ollama print-expert model and return structured
    print production analysis.
    """
    has_eyelids_hint = "(R)" in req.filename
    # Parse WxH from filename if present
    import re
    dim_match = re.search(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)", req.filename, re.IGNORECASE)
    filename_dims_hint = f"{dim_match.group(1)}x{dim_match.group(2)}" if dim_match else req.metadata_dims

    prompt = f"""You are a print production expert. Analyze this CorelDRAW print job and return a JSON object.

File details:
- Filename: {req.filename}
- Dimensions from filename: {filename_dims_hint} inches
- Dimensions from metadata: {req.metadata_dims} inches
- Page count in file: {req.page_count}
- Finishing flag "(R)" present: {has_eyelids_hint}

Rules for total_qty:
- If page_count is 1: the job is "1pc each" (single-sided, qty = number of pieces ordered, infer from filename context)
- If page_count > 1: total prints = page_count (each page is a unique print side or variation)
- Express total_qty as a human-readable string like "4 prints" or "1pc each"

Return ONLY a valid JSON object with these exact keys:
{{
  "dims": "<W>x<H> inches",
  "material": "<print material, e.g. Eco Vinyl, Backlit Film, Canvas>",
  "total_qty": "<quantity string>",
  "eyelids": <true if (R) flag present or job requires finishing eyelids, else false>,
  "substrate": "<mounting substrate, e.g. 5mm Sunboard, 3mm Acrylic, None>",
  "lamination": "<lamination type, e.g. Gloss, Matte, None>",
  "alerts": [<list of any production warnings as strings, empty array if none>]
}}"""

    ollama_payload = {
        "model": "print-expert",
        "prompt": prompt,
        "stream": False,
        "format": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json=ollama_payload,
            )
            resp.raise_for_status()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. Is the Ollama server running?",
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama request timed out.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Ollama returned error: {e.response.text}")

    ollama_data = resp.json()
    raw_response = ollama_data.get("response", "{}")

    try:
        parsed = json.loads(raw_response)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=422,
            detail=f"Ollama returned invalid JSON: {raw_response[:200]}",
        )

    # Normalise and validate fields with safe defaults
    return AiAnalysisResult(
        dims=str(parsed.get("dims", req.metadata_dims)),
        material=str(parsed.get("material", "Unknown")),
        total_qty=str(parsed.get("total_qty", f"{req.page_count} prints")),
        eyelids=bool(parsed.get("eyelids", has_eyelids_hint)),
        substrate=str(parsed.get("substrate", "None")),
        lamination=str(parsed.get("lamination", "None")),
        alerts=[str(a) for a in parsed.get("alerts", [])],
    )


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Accept full CDR file upload after user confirmation."""
    if not file.filename or not file.filename.lower().endswith(".cdr"):
        raise HTTPException(status_code=400, detail="Only .cdr files are accepted.")

    safe_filename = os.path.basename(file.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    size_mb = len(content) / (1024 * 1024)
    return {
        "status": "uploaded",
        "filename": safe_filename,
        "size_mb": round(size_mb, 2),
        "path": file_path,
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
