import os
import json

from groq import Groq


client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


def rewrite_query(query: str):

    prompt = f"""
You are a query rewriting agent for an enterprise RAG system.

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
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0,
        response_format={"type": "json_object"}
    )

    VALID_FALLBACK = query

    try:

        result = json.loads(
            response.choices[0].message.content
        )

        rewritten_query = result.get(
            "rewritten_query",
            VALID_FALLBACK
        )

    except Exception:

        rewritten_query = VALID_FALLBACK

    return {
        "original_query": query,
        "rewritten_query": rewritten_query
    }