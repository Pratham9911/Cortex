import os
import json
import urllib.error
import urllib.request

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_CHAT_COMPLETIONS_URL = (
    "https://api.fireworks.ai/inference/v1/chat/completions"
)
FIREWORKS_DECOMPOSER_MODEL = "accounts/fireworks/models/gpt-oss-20b"


def decompose_query(query: str) -> dict:
    """
    Decomposes the query into 2-5 subqueries of type 'project_knowledge' or 'web_search'.
    If the query does not require decomposition, returns a single query.
    """
    prompt = f"""
You are a multi-hop query decomposition agent for an enterprise RAG system.

Your job is to break a complex user question into 2 to 5 simpler, independently searchable subqueries.
Each subquery must have a specific type:
- "project_knowledge": for questions referencing project documents, internal requirements, specifications, meetings, codebases, or internal architecture.
- "web_search": for questions requiring external, public domain, or real-time internet knowledge.

Rules:
1. Generate between 2 to 5 subqueries ONLY if the query requires combining multiple pieces of information (comparison, aggregation, difference, relationship, timeline, or cross-source questions).
2. If the query is simple and does not require decomposition to answer, return exactly 1 query.
3. Preserve the original meaning and intent. Do not invent new concepts.
4. Do not answer the question or summarize. Only decompose.
5. Every subquery must be retrieval-optimized and independently searchable.
6. Return ONLY valid JSON matching the following schema:
{{
    "queries": [
        {{
            "type": "project_knowledge" | "web_search",
            "search_query": "..."
        }}
    ]
}}

Examples:

Input: Compare teacher portal requirements with student portal requirements.
Output:
{{
    "queries": [
        {{
            "type": "project_knowledge",
            "search_query": "teacher portal requirements"
        }},
        {{
            "type": "project_knowledge",
            "search_query": "student portal requirements"
        }}
    ]
}}

Input: Compare student requirements in BWF with hostel requirements in Jammu and Kashmir.
Output:
{{
    "queries": [
        {{
            "type": "project_knowledge",
            "search_query": "student requirements in BWF"
        }},
        {{
            "type": "web_search",
            "search_query": "hostel student requirements in Jammu and Kashmir"
        }}
    ]
}}

Input: Compare Glean architecture with Microsoft Copilot architecture.
Output:
{{
    "queries": [
        {{
            "type": "web_search",
            "search_query": "Glean architecture"
        }},
        {{
            "type": "web_search",
            "search_query": "Microsoft Copilot architecture"
        }}
    ]
}}

Input: What was discussed about the teacher portal in the last meeting?
Output:
{{
    "queries": [
        {{
            "type": "project_knowledge",
            "search_query": "teacher portal discussion last meeting"
        }}
    ]
}}

User Query:
{query}
"""

    VALID_FALLBACK = {
        "queries": [
            {
                "type": "project_knowledge",
                "search_query": query
            }
        ]
    }

    if not FIREWORKS_API_KEY:
        return VALID_FALLBACK

    try:
        payload = {
            "model": FIREWORKS_DECOMPOSER_MODEL,
            "temperature": 0,
            "max_tokens": 256,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "response_format": {"type": "json_object"}
        }

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {FIREWORKS_API_KEY}"
        }

        request = urllib.request.Request(
            FIREWORKS_CHAT_COMPLETIONS_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )

        with urllib.request.urlopen(request, timeout=30) as response:
            response_data = json.loads(response.read().decode("utf-8"))

        content = response_data["choices"][0]["message"]["content"]
        result = json.loads(content)
        
        # Validation
        if not isinstance(result, dict) or "queries" not in result:
            return VALID_FALLBACK
            
        queries = result["queries"]
        if not isinstance(queries, list) or len(queries) == 0:
            return VALID_FALLBACK
            
        validated_queries = []
        for q in queries:
            if not isinstance(q, dict):
                continue
            q_type = q.get("type")
            search_query = q.get("search_query")
            
            if q_type not in ["project_knowledge", "web_search"]:
                q_type = "project_knowledge"
                
            if search_query and isinstance(search_query, str):
                validated_queries.append({
                    "type": q_type,
                    "search_query": search_query.strip()
                })
                
        if not validated_queries:
            return VALID_FALLBACK
            
        return {"queries": validated_queries}

    except (
        KeyError,
        IndexError,
        OSError,
        json.JSONDecodeError,
        urllib.error.URLError
    ):
        return VALID_FALLBACK
