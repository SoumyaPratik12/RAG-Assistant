from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import json
from typing import Dict, Any, AsyncGenerator

from app.core.vector_store import vector_store

router = APIRouter(prefix="/query", tags=["Query"])

OLLAMA_URL = "http://127.0.0.1:11434"
LLM_MODEL = "llama3.2:1b"


def safe_text(d: Dict[str, Any]) -> str:
    return d.get("text", "")


@router.post("/stream")
async def query_stream(payload: Dict[str, Any]) -> StreamingResponse:
    question = payload.get("query")

    if not question:
        raise HTTPException(status_code=400, detail="Query is required")

    async def event_stream() -> AsyncGenerator[str, None]:
        docs = vector_store.search(question)

        if not docs:
            yield "data: I don't have enough information in the documents.\n\n"
            yield "data: [DONE]\n\n"
            return

        context = "\n\n".join(safe_text(d) for d in docs)

        if not context.strip():
            yield "data: I don't have enough information in the documents.\n\n"
            yield "data: [DONE]\n\n"
            return

        prompt = f"""
You are a Retrieval-Augmented assistant.

Use the context below to answer the question.
If the document is short or unstructured, infer high-level themes.
Do not hallucinate facts not supported by the text.

Context:
{context}

Question:
{question}

Answer:
"""

        previous_token = ""

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": LLM_MODEL,
                    "prompt": prompt,
                    "stream": True,
                },
            ) as response:
                async for line in response.aiter_lines():
                    if not line:
                        continue

                    data = json.loads(line)
                    token = data.get("response", "")

                    if token:
                        needs_space = (
                            previous_token
                            and not previous_token.endswith(" ")
                            and not token.startswith(" ")
                            and token not in ".,!?;:" 
                        )

                        output = (" " + token) if needs_space else token
                        previous_token = token

                        yield f"data: {output}\n\n"

                    if data.get("done"):
                        break

        # Send sources after the answer is complete
        sources = [
            {
                "id": f"source_{i}",
                "content": doc["text"],
                "metadata": doc["meta"],
            }
            for i, doc in enumerate(docs)
        ]
        yield f"data: [SOURCES]{json.dumps(sources)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
    )
