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

Your job is to break a complex question into independently searchable subqueries.

Types:
- project_knowledge
- web_search
User Query:
{query}
Rules:
- Preserve the user's intent and comparison dimension.
- Do not split mechanically.
- Keep important qualifiers and context.
- Do not invent new concepts.
- Return ONLY valid JSON.
- only split into 2 subquries .

Example:

Input:
Compare teacher portal requirements with student portal requirements.

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

Input:
Compare the incident happened to engineers in our company with any similar incident in India.

Output:
{{
  "queries": [
    {{
      "type": "project_knowledge",
      "search_query": "engineering incident involving engineers in our company"
    }},
    {{
      "type": "web_search",
      "search_query": "major engineering incident in India"
    }}
  ]
}}


"""
    VALID_FALLBACK = {
        "queries": [
            {
                "type": "project_knowledge",
                "search_query": "Fallback to :"+query
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
