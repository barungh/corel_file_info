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
    last_author: Optional[str] = None
    uuid: Optional[str] = None
    created_date: Optional[str] = None
    modify_date: Optional[str] = None
    bitmap_count: Optional[int] = None
    curve_count: Optional[int] = None
    total_objects: Optional[int] = None
    file_size_bytes: Optional[int] = None


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

def log_to_ledger(data: dict):
    """
    Placeholder function for financial logging. 
    Will be replaced with PostgreSQL logic in the next phase.
    """
    print(f"Ledger Log: {json.dumps(data, indent=2)}")


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "CorelDRAW File Analysis API", "status": "running", "version": "2.0.0"}


@app.post("/api/summary")
async def receive_summary(summary: FileSummary):
    """Accept a lightweight JSON summary of a processed CDR file."""
    record = summary.model_dump()
    summaries_store.append(record)
    
    # ── Production Log ──
    print("\n" + "="*50)
    print("PRODUCTION LOG")
    print("="*50)
    print(f"Filename:      {summary.filename}")
    print(f"Last Author:   {summary.last_author}")
    print(f"UUID:          {summary.uuid}")
    print(f"Creation Date: {summary.created_date}")
    print(f"Modify Date:   {summary.modify_date}")
    print(f"Total Objects: {summary.total_objects} (Bitmaps: {summary.bitmap_count}, Curves: {summary.curve_count})")
    print(f"File Size:     {summary.file_size_bytes} bytes")
    print("="*50 + "\n")

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
    prompt = f"Analyze this filename: '{req.filename}' with {req.page_count} pages. Return JSON."

    ollama_payload = {
        "model": "print-expert",
        "prompt": prompt,
        "stream": False,
        "format": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
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

    # Ensure mapping strictly uses the keys returned by the model
    result = AiAnalysisResult(
        dims=str(parsed.get("dims", "")),
        material=str(parsed.get("material", "")),
        total_qty=str(parsed.get("total_qty", "")),
        eyelids=bool(parsed.get("eyelids", False)),
        substrate=str(parsed.get("substrate", "")),
        lamination=str(parsed.get("lamination", "")),
        alerts=[str(a) for a in parsed.get("alerts", [])],
    )
    
    log_to_ledger(result.model_dump())
    return result


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
