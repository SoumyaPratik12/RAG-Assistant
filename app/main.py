"""
Edge RAG Server
FastAPI backend serving:
- RAG APIs
- Vite (React) frontend (production build)
"""

import os
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Routers
from app.routes.ingest import router as ingest_router
from app.routes.query import router as query_router

# Core
from app.core.vector_store import vector_store

# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent

# After `npm run build`:
# Frontend/dist → frontend/dist
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

# ============================================================
# CONFIG
# ============================================================

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "llama3.2:1b")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("edge-rag")

# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(title="Edge RAG Server")

# ============================================================
# CORS (DEV ONLY)
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# ROUTERS
# ============================================================

# Ingest: /ingest/text, /ingest/files
app.include_router(ingest_router)

# Query: /query/stream (SSE)
app.include_router(query_router)

# ============================================================
# META / STATUS ENDPOINTS
# ============================================================

@app.get("/health")
async def health():
    """
    Used by the frontend status bar
    """
    return {
        "status": "ok",
        "documents": vector_store.count(),
        "model": LLM_MODEL,
        "rag": True,
    }

@app.post("/clear")
async def clear_all():
    """
    Clears the vector database (knowledge base)
    """
    vector_store.clear()
    return {"status": "cleared"}

# ============================================================
# FRONTEND (VITE BUILD SERVING)
# ============================================================

if FRONTEND_DIST.exists():
    logger.info("Serving frontend from %s", FRONTEND_DIST)

    # Serve Vite static assets
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="assets",
    )

    # SPA fallback (React Router support)
    @app.get("/{path:path}")
    async def serve_spa(path: str):
        return FileResponse(FRONTEND_DIST / "index.html")

else:
    logger.warning("Frontend build not found")

    @app.get("/{path:path}")
    async def frontend_missing(path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "Frontend not built",
                "hint": (
                    "Run `npm run build` in Frontend/, "
                    "then copy Frontend/dist → frontend/dist"
                ),
            },
        )

# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    import uvicorn

    print("===================================")
    print(" Edge RAG Server running")
    print(" http://127.0.0.1:8000")
    print(" Ollama:", OLLAMA_URL)
    print(" Documents:", vector_store.count())
    print("===================================")

    uvicorn.run(app, host="127.0.0.1", port=8000)
