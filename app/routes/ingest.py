from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import List, Dict, Any
import os
import shutil
import uuid
from pathlib import Path

from app.core.chunking import chunk_text
from app.core.parsers import parse_file
from app.core.vector_store import vector_store

router = APIRouter(prefix="/ingest", tags=["Ingest"])

SUPPORTED_EXTENSIONS = (".pdf", ".doc", ".docx", ".txt", ".md")
DOCUMENTS_DIR = Path("data/documents")

os.makedirs(DOCUMENTS_DIR, exist_ok=True)

# ============================================================
# SHARED INGEST LOGIC
# ============================================================

def ingest_plain_text(
    text: str,
    source: str,
    chunk_size: int = 700,
    overlap: int = 100,
) -> int:
    chunks = chunk_text(text, chunk_size=chunk_size, overlap=overlap)

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


def sanitize_filename(filename: str) -> str:
    # Strip path components to prevent path traversal.
    clean = Path(filename).name.strip().replace("\x00", "")
    if not clean:
        raise ValueError("Invalid filename")
    return clean

# ============================================================
# INGEST RAW TEXT
# ============================================================

@router.post("/text")
async def ingest_text(payload: Dict[str, Any]) -> Dict[str, Any]:
    text = payload.get("text")
    replace = bool(payload.get("replace", False))

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    # Optional replacement mode; default behavior appends to existing KB.
    if replace:
        vector_store.clear()

    try:
        chunks_added = ingest_plain_text(
            text,
            source="manual-text",
            chunk_size=700,
            overlap=100,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "chunks_added": chunks_added,
        "total_chunks": vector_store.count(),
        "replace_mode": replace,
        "message": "Text ingested successfully",
    }

# ============================================================
# INGEST FILES
# ============================================================

@router.post("/files")
async def ingest_files(
    files: List[UploadFile] = File(...),
    replace: bool = Form(False),
) -> Dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    prepared_chunks: List[str] = []
    prepared_metas: List[Dict[str, Any]] = []
    ingested_files = []
    failed_files = []

    for file in files:
        original_name = file.filename or ""
        try:
            filename = sanitize_filename(original_name)
        except ValueError as e:
            failed_files.append({
                "file": original_name,
                "error": str(e),
            })
            continue

        filename_lower = filename.lower()

        if not filename_lower.endswith(SUPPORTED_EXTENSIONS):
            failed_files.append({
                "file": filename,
                "error": "Unsupported file type",
            })
            continue

        temp_name = f"{uuid.uuid4().hex}_{filename}"
        file_path = DOCUMENTS_DIR / temp_name

        try:
            # Save file
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Parse file
            text = parse_file(str(file_path), filename)
            if not text or not text.strip():
                raise ValueError("No readable text found")

            chunks = chunk_text(text, chunk_size=700, overlap=100)
            if not chunks:
                raise ValueError("No chunks generated")

            prepared_chunks.extend(chunks)
            prepared_metas.extend(
                {
                    "source": filename,
                    "chunk": i,
                }
                for i in range(len(chunks))
            )
            ingested_files.append(filename)

        except Exception as e:
            failed_files.append({
                "file": filename,
                "error": str(e),
            })
        finally:
            if file_path.exists():
                file_path.unlink()

    if not prepared_chunks:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No files were ingested",
                "failed_files": failed_files,
            },
        )

    if replace:
        vector_store.clear()
    vector_store.add(prepared_chunks, prepared_metas)

    return {
        "status": "success",
        "files_ingested": ingested_files,
        "failed_files": failed_files,
        "chunks_added": len(prepared_chunks),
        "total_chunks": vector_store.count(),
        "replace_mode": replace,
        "message": "Documents stored and indexed successfully",
    }
