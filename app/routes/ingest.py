from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List, Dict, Any
import os
import shutil

from app.core.chunking import chunk_text
from app.core.parsers import parse_file
from app.core.vector_store import vector_store

router = APIRouter(prefix="/ingest", tags=["Ingest"])

SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md")
DOCUMENTS_DIR = "data/documents"

os.makedirs(DOCUMENTS_DIR, exist_ok=True)

# ============================================================
# SHARED INGEST LOGIC
# ============================================================

def ingest_plain_text(text: str, source: str) -> int:
    chunks = chunk_text(text)

    if not chunks:
        raise ValueError("No chunks generated")

    metas = [
        {
            "source": source,
            "chunk": i,
        }
        for i in range(len(chunks))
    ]

    vector_store.add(chunks, metas)
    return len(chunks)

# ============================================================
# INGEST RAW TEXT
# ============================================================

@router.post("/text")
async def ingest_text(payload: Dict[str, Any]) -> Dict[str, Any]:
    text = payload.get("text")

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    # IMPORTANT: reset KB to avoid mixing old documents
    vector_store.clear()

    try:
        chunks_added = ingest_plain_text(text, source="manual-text")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "chunks_added": chunks_added,
        "total_chunks": vector_store.count(),
        "message": "Text ingested successfully",
    }

# ============================================================
# INGEST FILES
# ============================================================

@router.post("/files")
async def ingest_files(files: List[UploadFile] = File(...)) -> Dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # IMPORTANT: reset KB before file ingestion
    vector_store.clear()

    total_chunks = 0
    ingested_files = []
    failed_files = []

    for file in files:
        filename = file.filename or ""
        filename_lower = filename.lower()

        if not filename_lower.endswith(SUPPORTED_EXTENSIONS):
            failed_files.append({
                "file": filename,
                "error": "Unsupported file type",
            })
            continue

        file_path = os.path.join(DOCUMENTS_DIR, filename)

        try:
            # Save file
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Parse file
            text = parse_file(file_path, filename)
            if not text or not text.strip():
                raise ValueError("No readable text found")

            # Chunk + embed
            chunks_added = ingest_plain_text(text, source=filename)

            total_chunks += chunks_added
            ingested_files.append(filename)

        except Exception as e:
            failed_files.append({
                "file": filename,
                "error": str(e),
            })

            if os.path.exists(file_path):
                os.remove(file_path)

    if not ingested_files:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No files were ingested",
                "failed_files": failed_files,
            },
        )

    return {
        "status": "success",
        "files_ingested": ingested_files,
        "failed_files": failed_files,
        "chunks_added": total_chunks,
        "total_chunks": vector_store.count(),
        "message": "Documents stored and indexed successfully",
    }
