from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import json
import logging
import re
from typing import Dict, Any, AsyncGenerator

from app.core.settings import OLLAMA_URL, LLM_MODEL
from app.core.vector_store import vector_store

router = APIRouter(prefix="/query", tags=["Query"])

logger = logging.getLogger("edge-rag.query")


def safe_text(d: Dict[str, Any]) -> str:
    return d.get("text", "")


def sse_data(payload: str) -> str:
    lines = payload.splitlines() or [""]
    return "".join(f"data: {line}\n" for line in lines) + "\n"


def coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def is_summary_request(question: str) -> bool:
    q = question.lower()
    summary_markers = (
        "summarize",
        "summarise",
        "summary",
        "overview",
        "main topics",
        "what is this file about",
        "what is the file about",
        "key points",
    )
    return any(marker in q for marker in summary_markers)


def trim_text(text: str, max_chars: int) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars].rsplit(" ", 1)[0] + " ..."


def build_context(docs: list[Dict[str, Any]], max_total_chars: int, max_chunk_chars: int) -> str:
    blocks: list[str] = []
    used_chars = 0
    for i, d in enumerate(docs, start=1):
        text = trim_text(safe_text(d), max_chunk_chars)
        if not text:
            continue

        block = f"[Chunk {i}]\n{text}"
        if used_chars + len(block) > max_total_chars:
            break
        blocks.append(block)
        used_chars += len(block)
    return "\n\n".join(blocks)


def extract_json_payload(text: str) -> Dict[str, Any] | None:
    candidates: list[str] = []
    stripped = text.strip()

    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", stripped, flags=re.DOTALL)
    if fence_match:
        candidates.append(fence_match.group(1))

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(stripped[start:end + 1])

    candidates.append(stripped)

    for c in candidates:
        try:
            parsed = json.loads(c)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue

    return None


def format_structured_summary(payload: Dict[str, Any]) -> str:
    opening = str(payload.get("opening", "")).strip()
    definition = str(payload.get("definition", "")).strip()
    analogy = str(payload.get("analogy", "")).strip()
    in_short = str(payload.get("in_short", "")).strip()

    sections_raw = payload.get("main_sections", [])
    sections: list[Dict[str, Any]] = sections_raw if isinstance(sections_raw, list) else []

    def render_point_tree(item: Any, indent: int = 0) -> list[str]:
        prefix = "  " * indent + "- "
        rendered: list[str] = []

        if isinstance(item, str):
            point = item.strip()
            if point:
                rendered.append(f"{prefix}{point}")
            return rendered

        if isinstance(item, dict):
            point = str(item.get("point", "")).strip()
            if point:
                rendered.append(f"{prefix}{point}")

            subpoints_raw = item.get("subpoints", [])
            if isinstance(subpoints_raw, list):
                for sub in subpoints_raw:
                    rendered.extend(render_point_tree(sub, indent + 1))
            return rendered

        return rendered

    lines: list[str] = []
    if opening:
        lines.append(opening)
        lines.append("")
    if definition:
        lines.append(definition)
        lines.append("")
    if analogy:
        lines.append(f"**Simple Analogy:** {analogy}")
        lines.append("")

    lines.append("## Main Sections in the File")
    lines.append("")

    for idx, section in enumerate(sections, start=1):
        if not isinstance(section, dict):
            continue
        title = str(section.get("title", "")).strip() or f"Section {idx}"
        lines.append(f"{idx}. **{title}**")

        points_raw = section.get("points", [])
        points = points_raw if isinstance(points_raw, list) else []
        for p in points:
            lines.extend(render_point_tree(p))
        lines.append("")

    if in_short:
        lines.append("## In Short")
        lines.append("")
        lines.append(in_short)

    # Remove trailing blank lines while keeping markdown spacing.
    while lines and lines[-1] == "":
        lines.pop()

    return "\n".join(lines).strip()


@router.post("/stream")
async def query_stream(payload: Dict[str, Any]) -> StreamingResponse:
    question = (payload.get("query") or "").strip()
    summary_mode = is_summary_request(question)
    try:
        top_k = int(payload.get("topK", 5 if summary_mode else 4))
    except (TypeError, ValueError):
        top_k = 5 if summary_mode else 4
    top_k = max(1, min(top_k, 20))
    min_score = coerce_float(payload.get("threshold"), 0.05 if summary_mode else 0.08)
    min_score = max(-1.0, min(min_score, 1.0))

    if not question:
        raise HTTPException(status_code=400, detail="Query is required")

    async def event_stream() -> AsyncGenerator[str, None]:
        if summary_mode:
            docs = [
                {
                    "text": d.get("text", ""),
                    "meta": d.get("meta", {}),
                    "score": 1.0,
                }
                for d in vector_store.docs
            ]
            docs = sorted(
                docs,
                key=lambda d: (
                    str(d.get("meta", {}).get("source", "")),
                    int(d.get("meta", {}).get("chunk", 0)),
                ),
            )
            if len(docs) > top_k:
                docs = docs[:top_k]
            original_docs = docs[:]
        else:
            docs = vector_store.search(question, k=top_k)
            original_docs = docs[:]

        if not docs:
            yield sse_data("I don't have enough information in the documents.")
            yield sse_data("[DONE]")
            return

        if not summary_mode:
            best_score = float(docs[0].get("score", -1.0))
            # Keep recall high enough for broad questions while still filtering weak chunks.
            adaptive_cutoff = max(min_score, best_score - 0.20)
            docs = [
                d for d in docs
                if float(d.get("score", -1.0)) >= adaptive_cutoff
            ]

            # If strict filtering removed everything, keep top chunks as fallback.
            # This avoids false "not enough information" on broad/high-level questions.
            if not docs and original_docs:
                docs = original_docs[: min(3, len(original_docs))]

        if not docs:
            yield sse_data("I don't have enough information in the documents.")
            yield sse_data("[DONE]")
            return

        if summary_mode:
            context = build_context(
                docs=docs,
                max_total_chars=8000,
                max_chunk_chars=1200,
            )
        else:
            context = build_context(
                docs=docs,
                max_total_chars=5500,
                max_chunk_chars=900,
            )

        if not context.strip():
            yield sse_data("I don't have enough information in the documents.")
            yield sse_data("[DONE]")
            return

        if summary_mode:
            structured_prompt = f"""
You are a document summarization assistant.

Use ONLY the provided CONTEXT.
Do not add external facts.
If insufficient information exists, output this exact JSON:
{{"opening":"I don't have enough information in the uploaded documents.","definition":"","analogy":"","main_sections":[],"in_short":"I don't have enough information in the uploaded documents."}}

Return STRICT JSON only (no markdown, no prose outside JSON) with this shape:
{{
  "opening": "2-3 sentence paragraph: what the document is about and why it matters",
  "definition": "1-2 sentence paragraph defining the core concept in simple language",
  "analogy": "optional one-sentence analogy, keep short; empty string if not useful",
  "main_sections": [
    {{
      "title": "section title",
      "points": [
        "point 1",
        {{
          "point": "main point 2",
          "subpoints": ["sub point a", "sub point b"]
        }}
      ]
    }}
  ],
  "in_short": "one concise sentence"
}}

Rules:
- Keep wording clear and natural.
- Use exact ideas from CONTEXT only.
- Keep points concise (one line each).
- Add subpoints when a point naturally needs breakdown.
- No source labels/citations.
- For lists, output exactly one bullet per line (never multiple bullets in one line).

CONTEXT:
{context}

Question:
{question}

JSON:
"""
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=8.0)) as client:
                    response = await client.post(
                        f"{OLLAMA_URL}/api/generate",
                        json={
                            "model": LLM_MODEL,
                            "prompt": structured_prompt,
                            "stream": False,
                            "options": {
                                "temperature": 0,
                                "top_p": 0.9,
                                "num_predict": 260,
                            },
                        },
                    )

                    if response.status_code >= 400:
                        detail = response.text[:300] if response.text else "unknown backend error"
                        yield sse_data(f"[ERROR]Model backend error ({response.status_code}): {detail}")
                        yield sse_data("[DONE]")
                        return

                    payload = response.json()
                    raw_text = str(payload.get("response", "")).strip()
                    parsed = extract_json_payload(raw_text)
                    if parsed is not None:
                        markdown = format_structured_summary(parsed)
                    else:
                        markdown = raw_text

                    if not markdown:
                        markdown = "I don't have enough information in the uploaded documents."

                    yield sse_data(markdown)
                    yield sse_data("[DONE]")
                    return
            except httpx.HTTPError as e:
                yield sse_data(f"[ERROR]Could not reach model backend at {OLLAMA_URL}: {e}")
                yield sse_data("[DONE]")
                return
            except Exception:
                logger.exception("Unexpected summary generation error")
                yield sse_data("[ERROR]Unexpected error while generating the answer.")
                yield sse_data("[DONE]")
                return
        else:
            prompt = f"""
You are a Retrieval-Augmented assistant.

Answer ONLY from the provided CONTEXT.
If the answer is not clearly present in CONTEXT, reply exactly:
I don't have enough information in the uploaded documents.
Do not use external or prior knowledge.
Do not infer beyond the text.
Return only the direct answer to the user's question.
If the user asks for exact information, provide exact values/phrases from CONTEXT.
Do not output source/citation labels and do not add a "Sources" section.
Use markdown with short paragraphs and one blank line between paragraphs.
If listing 2 or more items, use bullet points.
Each bullet must be on its own line.
Use sub-bullets for details/examples under a main bullet where appropriate.

CONTEXT:
{context}

Question:
{question}

Answer:
"""

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0, read=None)) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": LLM_MODEL,
                        "prompt": prompt,
                        "stream": True,
                        "options": {
                            "temperature": 0.1 if summary_mode else 0,
                            "top_p": 0.9,
                            "num_predict": 260 if summary_mode else 190,
                        },
                    },
                ) as response:
                    if response.status_code >= 400:
                        detail = (await response.aread()).decode("utf-8", errors="ignore")
                        detail = detail[:300] if detail else "unknown backend error"
                        yield sse_data(f"[ERROR]Model backend error ({response.status_code}): {detail}")
                        yield sse_data("[DONE]")
                        return

                    token_buffer = ""
                    has_flushed_once = False
                    first_flush_chars = 36
                    flush_chars = 96 if summary_mode else 72

                    async for line in response.aiter_lines():
                        if not line:
                            continue

                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            logger.warning("Skipping malformed model stream line")
                            continue

                        token = data.get("response", "")

                        if token:
                            # Buffer token emissions to reduce frontend re-render overhead.
                            token_buffer += token
                            dynamic_flush = first_flush_chars if not has_flushed_once else flush_chars
                            if (
                                len(token_buffer) >= dynamic_flush
                                or token.endswith("\n")
                                or token.endswith(".")
                                or token.endswith("?")
                                or token.endswith("!")
                            ):
                                yield sse_data(token_buffer)
                                token_buffer = ""
                                has_flushed_once = True

                        if data.get("done"):
                            if token_buffer:
                                yield sse_data(token_buffer)
                            break
        except httpx.HTTPError as e:
            yield sse_data(f"[ERROR]Could not reach model backend at {OLLAMA_URL}: {e}")
            yield sse_data("[DONE]")
            return
        except Exception:
            logger.exception("Unexpected query streaming error")
            yield sse_data("[ERROR]Unexpected error while generating the answer.")
            yield sse_data("[DONE]")
            return

        yield sse_data("[DONE]")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
