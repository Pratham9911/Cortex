
import os

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_NORMAL_MODEL = os.getenv("MAIN_MODEL", "accounts/fireworks/models/gpt-oss-120b")

_SYNTHESIS_SYSTEM = (
    "You are a helpful assistant. "
    "Using the web search snippets provided, write a clear and well-structured answer "
    "to the user's question. "
    "Format your response using rich standard Markdown "
    "(such as **bold text**, tables, bulleted or numbered lists, blockquotes, and headings like ###). "
    "Keep your response under 400 words. "
    "Do not repeat snippets verbatim."
)


def _synthesize_with_fireworks(query: str, snippets: list[dict]) -> str:
    """
    Fallback: when Tavily returns results but no pre-built answer,
    synthesize one using Fireworks LLM.
    """
    import json
    import urllib.request

    context = "\n\n".join(
        f"[{i+1}] {s.get('title', '')}\n{s.get('snippet', '')}"
        for i, s in enumerate(snippets)
    )

    payload = {
        "model": FIREWORKS_NORMAL_MODEL,
        "temperature": 0.2,
        "max_tokens": 1024,
        "messages": [
            {"role": "system", "content": _SYNTHESIS_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Web search results for: {query}\n\n"
                    f"{context}\n\n"
                    f"Answer the question: {query}"
                ),
            },
        ],
    }

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
    }

    req = urllib.request.Request(
        "https://api.fireworks.ai/inference/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return data["choices"][0]["message"]["content"].strip()


def run_tavily_web_search(query: str):
    """
    Generator that yields SSE-ready dicts for the RAG pipeline:

        {"type": "status",  "step": "web_search",   "message": "..."}
        {"type": "sources", "step": "web_sources",  "sources": [...]}
        {"type": "final",   "intent": "web_search", "answer": "...", "sources": [...]}

    On failure yields:
        {"type": "error", "message": "..."}

    The caller (handle_web_search in handlers.py) catches "error" and falls
    back to the Tinyfish manual search.
    """

    if not TAVILY_API_KEY:
        yield {
            "type": "error",
            "message": "TAVILY_API_KEY environment variable is not set.",
        }
        return

    # ── Status ────────────────────────────────────────────────────────
    yield {
        "type": "status",
        "step": "web_search",
        "message": f"Searching the web for: {query}",
    }

    try:
        from tavily import TavilyClient

        tavily_client = TavilyClient(api_key=TAVILY_API_KEY)

        search_results = tavily_client.search(
            query=query,
            include_answer="advanced",
            search_depth="fast",
            include_raw_content=False,
            include_favicon=True,
            max_results=5,
        )

    except Exception as exc:
        yield {
            "type": "error",
            "message": f"Tavily search failed: {exc}",
        }
        return

    # ── Parse sources ─────────────────────────────────────────────────
    sources = []
    for result in search_results.get("results", []):
        title = result.get("title", "")
        url = result.get("url", "")
        snippet = result.get("content", "") or result.get("snippet", "")
        score = result.get("score", 0.0)
        favicon = result.get("favicon", "")

        if title or url:
            sources.append(
                {
                    "title": str(title)[:200],
                    "url": str(url),
                    "snippet": str(snippet)[:400],
                    "score": float(score) if score is not None else 0.0,
                    "favicon": str(favicon) if favicon else "",
                }
            )

    # Sort by relevance score descending
    sources.sort(key=lambda x: x.get("score", 0.0), reverse=True)

    # ── Get / synthesize answer ───────────────────────────────────────
    answer = search_results.get("answer") or ""

    if not answer:
        if sources:
            # Tavily gave results but no pre-built answer — synthesize
            try:
                answer = _synthesize_with_fireworks(query, sources)
            except Exception as exc:
                yield {
                    "type": "error",
                    "message": f"Answer synthesis failed: {exc}",
                }
                return
        else:
            # No results at all
            yield {
                "type": "error",
                "message": "Tavily returned no results for this query.",
            }
            return

    # ── Emit sources ──────────────────────────────────────────────────
    if sources:
        yield {
            "type": "sources",
            "step": "web_sources",
            "sources": sources,
        }

    # ── Emit final answer ─────────────────────────────────────────────
    yield {
        "type": "final",
        "intent": "web_search",
        "answer": answer,
        "sources": sources,
    }


# Backwards-compatible alias — nothing else in the codebase should break
run_groq_web_search = run_tavily_web_search
