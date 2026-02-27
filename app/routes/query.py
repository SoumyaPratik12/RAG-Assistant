from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import json
import logging
import re
from pathlib import Path
from typing import Dict, Any, AsyncGenerator

from app.core.settings import OLLAMA_URL, LLM_MODEL
from app.core.vector_store import vector_store

router = APIRouter(prefix="/query", tags=["Query"])

logger = logging.getLogger("edge-rag.query")


TOKEN_RE = re.compile(r"[a-z0-9]{2,}")
STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "of", "in", "on", "at", "to", "for", "from", "by", "with", "as", "and",
    "or", "if", "then", "that", "this", "these", "those", "it", "its",
    "into", "about", "over", "under", "between", "can", "could", "should",
    "would", "do", "does", "did", "what", "which", "who", "whom", "when",
    "where", "why", "how", "your", "you", "my", "our", "their",
}
SUMMARY_KEYS = ("opening", "definition", "analogy", "main_sections", "in_short")
CONTEXT_MARKER_RE = re.compile(r"\[Document\s+\d+\s*\|\s*Chunk:\s*\d+\]", re.IGNORECASE)


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


def source_name(doc: Dict[str, Any], default: str = "unknown-source") -> str:
    meta = doc.get("meta", {}) if isinstance(doc, dict) else {}
    source = str(meta.get("source", "")).strip()
    return source or default


def tokenize(text: str) -> set[str]:
    return {
        t for t in TOKEN_RE.findall((text or "").lower())
        if t not in STOPWORDS
    }


def lexical_overlap_score(question: str, chunk_text: str) -> float:
    q_tokens = tokenize(question)
    if not q_tokens:
        return 0.0
    c_tokens = tokenize(chunk_text)
    if not c_tokens:
        return 0.0
    # Recall-oriented overlap: how much of the question vocabulary is found in chunk text.
    return len(q_tokens & c_tokens) / max(1, len(q_tokens))


def question_mentions_source(question: str, source: str) -> bool:
    q_lower = (question or "").lower()
    src_stem = Path(source).stem.lower().replace("_", " ").replace("-", " ").strip()
    if not src_stem:
        return False
    if src_stem in q_lower:
        return True
    src_tokens = [t for t in TOKEN_RE.findall(src_stem) if t not in STOPWORDS]
    q_tokens = tokenize(question)
    return bool(src_tokens) and all(t in q_tokens for t in src_tokens)


def rerank_docs_hybrid(question: str, docs: list[Dict[str, Any]], k: int) -> list[Dict[str, Any]]:
    if not docs:
        return []

    scored: list[tuple[int, float, str]] = []
    for idx, d in enumerate(docs):
        dense = coerce_float(d.get("score"), -1.0)
        # Cosine-like dense score typically in [-1, 1]; map to [0, 1].
        dense01 = max(0.0, min(1.0, (dense + 1.0) / 2.0))
        lexical = lexical_overlap_score(question, safe_text(d))
        src = source_name(d)

        source_boost = 0.12 if question_mentions_source(question, src) else 0.0
        phrase_boost = 0.10 if (question or "").strip().lower() in safe_text(d).lower() else 0.0

        # Blend semantic retrieval with lexical grounding to reduce hallucinations.
        blended = (dense01 * 0.68) + (lexical * 0.32) + source_boost + phrase_boost
        d["retrieval_score"] = blended
        d["lexical_score"] = lexical
        scored.append((idx, blended, src))

    scored.sort(key=lambda x: x[1], reverse=True)

    # Keep source diversity so multi-file questions stay properly grounded.
    selected_ids: set[int] = set()
    selected: list[Dict[str, Any]] = []
    seen_sources: set[str] = set()

    for idx, _, src in scored:
        if src in seen_sources:
            continue
        selected_ids.add(idx)
        seen_sources.add(src)
        selected.append(docs[idx])
        if len(selected) >= k:
            return selected

    for idx, _, _ in scored:
        if idx in selected_ids:
            continue
        selected_ids.add(idx)
        selected.append(docs[idx])
        if len(selected) >= k:
            break

    return selected


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

        meta = d.get("meta", {}) if isinstance(d, dict) else {}
        chunk_no = meta.get("chunk", i)
        # Keep retrieval context segmented without exposing filenames in model output.
        block = f"[Document {i} | Chunk: {chunk_no}]\n{text}"
        if used_chars + len(block) > max_total_chars:
            break
        blocks.append(block)
        used_chars += len(block)
    return "\n\n".join(blocks)


def strip_context_echo(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n")
    marker_match = CONTEXT_MARKER_RE.search(cleaned)
    if marker_match:
        cleaned = cleaned[:marker_match.start()]

    cleaned = re.split(
        r"\n\s*(?:CONTEXT|Question|Answer)\s*:\s*\n",
        cleaned,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return cleaned.strip()


def extract_json_payload(text: str) -> Dict[str, Any] | None:
    cleaned = strip_context_echo(text)

    values = extract_json_values(cleaned)
    merged = coerce_summary_payload(values)
    if merged is not None:
        return merged

    candidates: list[str] = []
    stripped = cleaned.strip()

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

    repaired = repair_json_like_text(stripped)
    if repaired is not None:
        return repaired

    loose = extract_summary_payload_loose(stripped)
    if loose is not None:
        return loose

    return None


def extract_json_values(text: str) -> list[Any]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []

    # Models sometimes wrap or concatenate JSON fragments with prose/fences.
    cleaned = re.sub(r"```(?:json)?", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("```", "")

    decoder = json.JSONDecoder()
    values: list[Any] = []
    idx = 0
    n = len(cleaned)

    while idx < n:
        ch = cleaned[idx]
        if ch not in "{[":
            idx += 1
            continue
        try:
            value, end = decoder.raw_decode(cleaned, idx)
            values.append(value)
            idx = end
        except json.JSONDecodeError:
            idx += 1

    return values


def repair_json_like_text(text: str) -> Dict[str, Any] | None:
    cleaned = (text or "").strip()
    if not cleaned:
        return None

    if "{" not in cleaned:
        return None

    # Keep only the likely JSON body.
    start = cleaned.find("{")
    body = cleaned[start:]
    body = re.sub(r"```(?:json)?", "", body, flags=re.IGNORECASE)
    body = body.replace("```", "").strip()

    # Common model glitch: missing final closers and trailing commas.
    open_brace = body.count("{")
    close_brace = body.count("}")
    if close_brace < open_brace:
        body += "}" * (open_brace - close_brace)

    open_bracket = body.count("[")
    close_bracket = body.count("]")
    if close_bracket < open_bracket:
        body += "]" * (open_bracket - close_bracket)

    body = re.sub(r",\s*([}\]])", r"\1", body)

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed, dict):
        return None
    return parsed


def extract_summary_payload_loose(text: str) -> Dict[str, Any] | None:
    cleaned = (text or "").strip()
    if not cleaned:
        return None

    payload: Dict[str, Any] = {k: "" for k in SUMMARY_KEYS if k != "main_sections"}
    payload["main_sections"] = []

    def _extract_str(key: str) -> str:
        patterns = [
            rf'"{key}"\s*:\s*"((?:\\.|[^"\\])*)"',
            rf"'{key}'\s*:\s*'((?:\\.|[^'\\])*)'",
        ]
        for pat in patterns:
            m = re.search(pat, cleaned, flags=re.IGNORECASE | re.DOTALL)
            if m:
                return m.group(1).replace('\\"', '"').replace("\\'", "'").strip()
        return ""

    for key in ("opening", "definition", "analogy", "in_short"):
        payload[key] = _extract_str(key)

    sections_match = re.search(
        r'"main_sections"\s*:\s*(\[[\s\S]*?\])',
        cleaned,
        flags=re.IGNORECASE,
    )
    if sections_match:
        try:
            maybe_sections = json.loads(sections_match.group(1))
            if isinstance(maybe_sections, list):
                payload["main_sections"] = maybe_sections
        except json.JSONDecodeError:
            payload["main_sections"] = []

    if any(str(payload.get(k, "")).strip() for k in ("opening", "definition", "analogy", "in_short")):
        return payload

    return None


def extract_fallback_points(docs: list[Dict[str, Any]], max_points: int = 6) -> list[str]:
    points: list[str] = []
    seen: set[str] = set()

    for d in docs:
        text = safe_text(d)
        if not text:
            continue

        for raw in re.split(r"(?<=[.!?])\s+|\n+", text):
            candidate = " ".join(raw.split()).strip(" -.;:")
            if len(candidate) < 24 or len(candidate) > 150:
                continue
            lower = candidate.lower()
            if "document" in lower and "chunk" in lower:
                continue
            if ".com" in lower or "http://" in lower or "https://" in lower:
                continue
            if candidate.count("(") + candidate.count(")") >= 3:
                continue
            if ";" in candidate and ("select" in lower or "from" in lower):
                continue

            alpha_chars = sum(1 for ch in candidate if ch.isalpha() or ch.isspace())
            if alpha_chars / max(1, len(candidate)) < 0.72:
                continue

            key = lower
            if key in seen:
                continue
            seen.add(key)
            points.append(candidate)
            if len(points) >= max_points:
                return points

    return points


def build_fallback_summary_payload(docs: list[Dict[str, Any]]) -> Dict[str, Any]:
    points = extract_fallback_points(docs, max_points=6)
    if not points:
        return {
            "opening": "Main topics are present across the uploaded documents, but could not be structured reliably.",
            "definition": "",
            "analogy": "",
            "main_sections": [
                {
                    "title": "Main Topics",
                    "points": ["Multiple related topics are covered in the uploaded documents."],
                }
            ],
            "in_short": "Multiple topics are covered in the uploaded documents.",
        }

    return {
        "opening": "Here is a concise summary based on the uploaded documents.",
        "definition": "",
        "analogy": "",
        "main_sections": [
            {
                "title": "Main Topics",
                "points": points,
            }
        ],
        "in_short": points[0],
    }


def ensure_summary_quality(payload: Dict[str, Any], docs: list[Dict[str, Any]]) -> Dict[str, Any]:
    sections = payload.get("main_sections", [])
    has_points = False
    if isinstance(sections, list):
        for section in sections:
            if not isinstance(section, dict):
                continue
            points = section.get("points", [])
            if isinstance(points, list) and any(str(p).strip() for p in points):
                has_points = True
                break

    if has_points:
        return payload

    fallback = build_fallback_summary_payload(docs)
    merged = dict(payload)
    if not str(merged.get("opening", "")).strip():
        merged["opening"] = fallback.get("opening", "")
    if not str(merged.get("definition", "")).strip():
        merged["definition"] = fallback.get("definition", "")
    if not str(merged.get("analogy", "")).strip():
        merged["analogy"] = fallback.get("analogy", "")
    if not str(merged.get("in_short", "")).strip():
        merged["in_short"] = fallback.get("in_short", "")
    merged["main_sections"] = fallback.get("main_sections", [])
    return merged


def coerce_summary_payload(values: list[Any]) -> Dict[str, Any] | None:
    if not values:
        return None

    payload: Dict[str, Any] = {}
    list_candidates: list[list[str]] = []

    for value in values:
        if isinstance(value, dict):
            for key in SUMMARY_KEYS:
                incoming = value.get(key)

                if key == "main_sections":
                    if isinstance(incoming, list) and incoming:
                        payload[key] = incoming
                    continue

                if isinstance(incoming, str):
                    incoming = incoming.strip()

                if incoming and not payload.get(key):
                    payload[key] = incoming

        elif isinstance(value, list):
            items = [
                str(item).strip()
                for item in value
                if isinstance(item, str) and str(item).strip()
            ]
            if items:
                list_candidates.append(items)

    if not payload:
        return None

    sections = payload.get("main_sections")
    if isinstance(sections, list):
        if sections and all(isinstance(s, str) for s in sections):
            payload["main_sections"] = [
                {
                    "title": "Main Topics",
                    "points": [str(s).strip() for s in sections if str(s).strip()],
                }
            ]
        elif not sections and list_candidates:
            payload["main_sections"] = [
                {"title": "Main Topics", "points": list_candidates[0]}
            ]
    else:
        payload["main_sections"] = (
            [{"title": "Main Topics", "points": list_candidates[0]}]
            if list_candidates
            else []
        )

    for key in SUMMARY_KEYS:
        payload.setdefault(key, [] if key == "main_sections" else "")

    return payload


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
        top_k = int(payload.get("topK", 12 if summary_mode else 3))
    except (TypeError, ValueError):
        top_k = 12 if summary_mode else 3
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
            original_docs = docs[:]
        else:
            # Over-fetch for better re-ranking and filtering quality.
            candidate_k = max(top_k * 3, 8)
            docs = vector_store.search(question, k=candidate_k)
            docs = rerank_docs_hybrid(question, docs, k=max(top_k * 2, 6))
            original_docs = docs[:]

        if not docs:
            yield sse_data("I don't have enough information in the documents.")
            yield sse_data("[DONE]")
            return

        if not summary_mode:
            best_score = coerce_float(docs[0].get("retrieval_score"), 0.0)
            # Hybrid cutoff (semantic + lexical) to keep context grounded and relevant.
            adaptive_cutoff = max(min_score, best_score - 0.30)
            docs = [
                d for d in docs
                if coerce_float(d.get("retrieval_score"), 0.0) >= adaptive_cutoff
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
                max_total_chars=12000,
                max_chunk_chars=1200,
            )
        else:
            context = build_context(
                docs=docs,
                max_total_chars=5000,
                max_chunk_chars=760,
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
                            "format": "json",
                            "stream": False,
                            "options": {
                                "temperature": 0,
                                "top_p": 0.9,
                                "num_predict": 210,
                            },
                        },
                    )

                    if response.status_code >= 400:
                        detail = response.text[:300] if response.text else "unknown backend error"
                        yield sse_data(f"[ERROR]Model backend error ({response.status_code}): {detail}")
                        yield sse_data("[DONE]")
                        return

                    payload = response.json()
                    raw_text = strip_context_echo(str(payload.get("response", "")))
                    parsed = extract_json_payload(raw_text)
                    if parsed is None:
                        parsed = build_fallback_summary_payload(docs)
                    else:
                        parsed = ensure_summary_quality(parsed, docs)
                    markdown = format_structured_summary(parsed)

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
Keep the answer concise by default (about 80-140 words) unless the user asks for deep detail.
If the user asks for exact information, provide exact values/phrases from CONTEXT.
If multiple documents are in CONTEXT, keep facts separate and do not mix them.
Do not add a "Sources" section.
Do not mention file names or source labels unless the user explicitly asks for them.
Use markdown with short paragraphs and one blank line between paragraphs.
If listing 2 or more items, use bullet points.
Each bullet must be on its own line.
Use sub-bullets for details/examples under a main bullet where appropriate.
If a detail is missing or ambiguous in CONTEXT, say that explicitly instead of guessing.

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
                            "num_predict": 210 if summary_mode else 120,
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
                    first_flush_chars = 72
                    flush_chars = 180 if summary_mode else 140
                    context_echo_detected = False

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

                            if not summary_mode:
                                marker = CONTEXT_MARKER_RE.search(token_buffer)
                                if marker:
                                    token_buffer = token_buffer[:marker.start()]
                                    context_echo_detected = True
                                    if token_buffer.strip():
                                        yield sse_data(token_buffer)
                                    token_buffer = ""
                                    continue

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
                            if token_buffer and not context_echo_detected:
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
