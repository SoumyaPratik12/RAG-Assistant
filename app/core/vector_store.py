import pickle
from typing import List, Dict, Any, Optional
import numpy as np
from pathlib import Path
from .embeddings import Embedder

BASE = Path("data/vector_db")
BASE.mkdir(parents=True, exist_ok=True)
FILE = BASE / "store.pkl"

embedder = Embedder()


def normalize(v: np.ndarray) -> np.ndarray:
    if v.ndim == 1:
        return v / (np.linalg.norm(v) + 1e-10)
    return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-10)


class VectorStore:
    def __init__(self):
        self.docs: List[Dict[str, Any]] = []
        self.embs: Optional[np.ndarray] = None

        if FILE.exists():
            with open(FILE, "rb") as f:
                data = pickle.load(f)
                self.docs = data.get("docs", [])
                self.embs = (
                    np.array(data["embs"])
                    if data.get("embs") is not None
                    else None
                )

    def count(self) -> int:
        return len(self.docs)

    def add(self, texts: List[str], metas: Optional[List[Dict[str, Any]]] = None):
        if not texts:
            return

        if metas is None:
            metas = [{} for _ in texts]

        embeddings = normalize(embedder.embed(texts))

        for text, meta in zip(texts, metas):
            self.docs.append({
                "text": text,
                "meta": meta,
            })

        if self.embs is None:
            self.embs = embeddings
        else:
            if self.embs.shape[1] != embeddings.shape[1]:
                raise ValueError("Embedding dimension mismatch")
            self.embs = np.vstack([self.embs, embeddings])

        with open(FILE, "wb") as f:
            pickle.dump(
                {
                    "docs": self.docs,
                    "embs": self.embs.tolist(),
                },
                f,
            )

    def search(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        if self.embs is None or not self.docs:
            return []

        query_emb = normalize(embedder.embed([query]))[0]
        scores = self.embs @ query_emb
        indices = scores.argsort()[::-1][:k]

        return [
            {
                "text": self.docs[i]["text"],
                "meta": self.docs[i]["meta"],
                "score": float(scores[i]),
            }
            for i in indices
        ]

    def clear(self):
        self.docs = []
        self.embs = None
        if FILE.exists():
            FILE.unlink()


vector_store = VectorStore()
