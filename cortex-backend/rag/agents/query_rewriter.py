import os
import json

from groq import Groq


client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


def rewrite_query(query: str):

    prompt = f"""
You are a query rewriting agent for an enterprise RAG system.

Your job is to rewrite user questions into retrieval-optimized search queries.

Rules:
- Preserve the original meaning.
- Only fix spelling, abbreviations, and ambiguity.
- Do not invent new concepts.
- Keep the rewritten query concise.
- Do not answer the question.
- Do not add information not implied by the query.
- Do not infer any other concepts unless
explicitly implied by the user's query.

Return ONLY valid JSON.

Examples:

Input:
what about teacher portal

Output:
{{
    "rewritten_query": "teacher portal requirements discussion specifications"
}}

Input:
hostel attendance

Output:
{{
    "rewritten_query": "hostel attendance policy biometric attendance requirements"
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