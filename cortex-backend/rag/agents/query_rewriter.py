import os
import json

from langchain_fireworks import ChatFireworks

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
MAIN_MODEL = os.getenv("MAIN_MODEL", "accounts/fireworks/models/gpt-oss-120b")

client = ChatFireworks(
    model=MAIN_MODEL,
    temperature=0,
    api_key=FIREWORKS_API_KEY,
)


def rewrite_query(query: str):

    prompt = f"""You are a query rewriting agent for an enterprise RAG system.

Your job is to improve retrieval quality while preserving the user's original meaning.

Rules:
- Fix spelling mistakes.
- Expand abbreviations only when obvious.
- Preserve entities, dates, and key terms.
- Do not answer the question.
- Do not invent new concepts.
- Do not add words that are not implied by the query.
- Keep the rewritten query concise.

Return ONLY valid JSON.

Example:

Input:
Pratham rol for team meetin discussefd

Output:
{{
    "rewritten_query": "Pratham role for team meeting discussion"
}}

Input:
server storage

Output:
{{
    "rewritten_query": "server storage"
}}

User Query:
{query}
"""

    VALID_FALLBACK = query

    try:
        response = client.invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)

        # Strip markdown code fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        result = json.loads(content)
        rewritten_query = result.get("rewritten_query", VALID_FALLBACK)

    except Exception:
        rewritten_query = VALID_FALLBACK

    return {
        "original_query": query,
        "rewritten_query": rewritten_query
    }