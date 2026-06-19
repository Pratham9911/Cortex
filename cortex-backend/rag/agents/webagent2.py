
import os
from groq import Groq

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# System prompt used on the first attempt.
# Keeps the answer focused and structured beautifully.
_CONCISE_SYSTEM = (
    "You are a helpful assistant with web search access. "
    "Answer the user's question accurately and format your response using rich standard Markdown "
    "(such as **bold text**, tables, bulleted or numbered lists, blockquotes, and headings like ###). "
    "Make the layout visually clean and highly structured. Keep your response under 400 words. "
    "Do not repeat search snippets verbatim."
)

# Tighter prompt used on the 413 retry — forces Groq to fetch less.
_TIGHTER_SYSTEM = (
    "Answer in 3-5 sentences maximum using clean standard Markdown (e.g. lists, bold text). Be brief."
)

# Fallback model used when compound search itself is too large.
_FALLBACK_MODEL = "llama-3.3-70b-versatile"


def _is_413(exc: Exception) -> bool:
    """Return True if the exception is a 413 Request Entity Too Large."""
    msg = str(exc)
    return "413" in msg or "request_too_large" in msg or "Request Entity Too Large" in msg


def _call_groq(client: Groq, system: str, query: str, model: str, max_tokens: int):
    """Single blocking Groq call. Raises on error."""
    messages = []
    if system:                          # skip when empty — keeps request smaller
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": query})

    return client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
    )


def _obj_to_dict(obj) -> dict:
    """
    Convert a Groq SDK Pydantic model (or plain object) to a plain dict.
    Priority: model_dump() -> .dict() -> vars() -> dir()-scan.
    """
    # Pydantic v2
    if hasattr(obj, "model_dump"):
        try:
            return obj.model_dump()
        except Exception:
            pass
    # Pydantic v1
    if hasattr(obj, "dict"):
        try:
            return obj.dict()
        except Exception:
            pass
    # Plain Python object
    try:
        d = vars(obj)
        if d:
            return d
    except TypeError:
        pass
    # Last resort: dir()-based scan
    return {
        k: getattr(obj, k)
        for k in dir(obj)
        if not k.startswith("_") and not callable(getattr(obj, k, None))
    }


def _extract_sources(message) -> list:
    """
    Pull search_results from executed_tools.
    Structure from Groq SDK (discovered via debug):
      tool -> model_dump() -> {"output": {"search_results": [
        {"title": "...", "url": "...", "content": "...", "score": 0.8},
        ...
      ]}}
    """
    sources = []
    executed_tools = getattr(message, "executed_tools", None) or []

    for tool in executed_tools:
        tool_dict = _obj_to_dict(tool)

        # Results are nested under output.search_results
        output = tool_dict.get("output") or {}
        if isinstance(output, dict):
            search_results = output.get("search_results") or []
        else:
            # output may itself be a Pydantic object
            search_results = getattr(output, "search_results", []) or []

        for r in search_results:
            d = r if isinstance(r, dict) else _obj_to_dict(r)

            title   = d.get("title", "")
            url     = d.get("url", "")
            snippet = d.get("content", "") or d.get("snippet", "")
            score   = d.get("score", 0.0)

            if title or url:
                sources.append({
                    "title":   str(title)[:200],
                    "url":     str(url),
                    "snippet": str(snippet)[:300],
                    "score":   float(score) if score is not None else 0.0
                })

    import re
    if not sources and getattr(message, "reasoning", None):
        reasoning = message.reasoning
        blocks = re.split(r'Title:', reasoning)
        for block in blocks[1:]:
            lines = block.strip().split('\n')
            if not lines: continue
            title = lines[0].strip()
            url = ""
            snippet = ""
            score = 0.0
            
            for line in lines[1:]:
                line = line.strip()
                if line.startswith('URL:'):
                    url = line[4:].strip()
                elif line.startswith('Content:'):
                    snippet = line[8:].strip()
                elif line.startswith('Score:'):
                    try:
                        score = float(line[6:].strip())
                    except ValueError:
                        pass
            
            if title or url:
                sources.append({
                    "title": str(title)[:200],
                    "url": str(url),
                    "snippet": str(snippet)[:300],
                    "score": float(score)
                })

    sources.sort(key=lambda x: x.get("score", 0.0), reverse=True)

    return sources


def run_groq_web_search(query: str):
    """
    Generator that yields SSE-ready dicts:

        {"type": "status",  "step": "groq_search",  "message": "..."}
        {"type": "status",  "step": "groq_retry",   "message": "..."}   <- on 413
        {"type": "status",  "step": "groq_fallback","message": "..."}   <- on 2nd 413
        {"type": "sources", "step": "groq_sources",  "sources": [...]}
        {"type": "final",   "answer": "..."}

    Retry strategy
    ──────────────
    Attempt 1  compound-beta-mini  NO system prompt  (smallest possible request)
    Attempt 2  compound-beta-mini  brief system prompt, max_tokens=800  (on 413)
    Attempt 3  llama-3.3-70b       no web search  (on 2nd 413)
    """

    if not GROQ_API_KEY:
        yield {
            "type": "error",
            "message": "GROQ_API_KEY environment variable is not set."
        }
        return

    client = Groq(api_key=GROQ_API_KEY)

    # ── Attempt 1 ────────────────────────────────────────────────────
    yield {
        "type": "status",
        "step": "groq_search",
        "message": f"Searching and reasoning about: {query}"
    }

    try:
        response = _call_groq(
            client,
            system="",           # No system prompt — keeps request minimal
            query=query,
            model="compound-beta-mini",
            max_tokens=800,
        )

    except Exception as e1:

        if not _is_413(e1):
            yield {"type": "error", "message": f"Groq API error: {e1}"}
            return

        # ── Attempt 2: tighter prompt ────────────────────────────────
        yield {
            "type": "status",
            "step": "groq_retry",
            "message": "Search context was large, retrying with focused search..."
        }

        try:
            response = _call_groq(
                client,
                system=_TIGHTER_SYSTEM,
                query=query,
                model="compound-beta-mini",
                max_tokens=800,   # Needs headroom so executed_tools are included
            )

        except Exception as e2:

            if not _is_413(e2):
                yield {"type": "error", "message": f"Groq API error: {e2}"}
                return

            # ── Attempt 3: plain LLM fallback (no web search) ────────
            yield {
                "type": "status",
                "step": "groq_fallback",
                "message": "Answering from model knowledge (web search unavailable for this query)..."
            }

            try:
                response = _call_groq(
                    client,
                    system=(
                        "Answer the user's question using your training knowledge. "
                        "Be concise and clear."
                    ),
                    query=query,
                    model=_FALLBACK_MODEL,
                    max_tokens=600,
                )
            except Exception as e3:
                yield {"type": "error", "message": f"Groq API error: {e3}"}
                return

    # ── Emit sources (compound model only) ───────────────────────────
    message = response.choices[0].message
    sources = _extract_sources(message)
    if sources:
        yield {
            "type": "sources",
            "step": "groq_sources",
            "sources": sources
        }

    # ── Emit final answer ─────────────────────────────────────────────
    yield {
        "type": "final",
        "intent": "web_search",
        "answer": message.content or "",
        "sources": sources
    }
