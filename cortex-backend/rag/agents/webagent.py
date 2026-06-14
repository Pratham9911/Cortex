# webAgent.py

import os
import json
import requests
from urllib.parse import urlparse
from tinyfish import TinyFish

TINYFISH_API_KEY = os.getenv("TINYFISH_API_KEY1") or os.getenv("TINYFISH_API_KEY")

FIREWORKS_API_KEY = os.getenv(
    "FIREWORKS_API_KEY"
)

if not TINYFISH_API_KEY:
    raise RuntimeError("TINYFISH_API_KEY or TINYFISH_API_KEY1 environment variable is required")

tinyfish = TinyFish(api_key=TINYFISH_API_KEY)


def analyze_search_results(
    query: str,
    results: list
):

    prompt = f"""
You are selecting web pages for retrieval.

User Query:
{query}

Search Results:
{json.dumps(results, indent=2)}

Goal:
Select the most promising pages that should be fetched and read in full.

Selection Rules:

1. Prefer pages that are likely to contain the complete answer.
2. Prefer:
   - Official documentation
   - Official websites
   - if any source matches the user's query closely
   - Technical blogs
   - Research articles
   - High quality educational content

3. Avoid when possible:
   - Search result pages
   - Login pages
   - Advertisements
   - no videos or tutorials 

4. Return at most 3 index to fetch

5. Return only indices that are likely worth fetching.

Output format:

{{
  "selected_indices": [1,2,3]
}}

Return ONLY valid JSON.
"""

    payload = {
        "model":
            "accounts/fireworks/models/gpt-oss-20b",
        "temperature": 0,
        "max_tokens": 256,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    }

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization":
            f"Bearer {FIREWORKS_API_KEY}"
    }
    print("Entering analyze_search_results with payload:")
    
    response = requests.post(
        "https://api.fireworks.ai/inference/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=30
    )

    response.raise_for_status()

    data = response.json()

    # print(json.dumps(data, indent=2))
    
    choices = data.get("choices", [])
    
    if not choices:
        return {
            "selected_indices": []
        }
    
    message = choices[0].get("message", {})
    
    content = message.get("content")
    
    if not content:
        return {
            "selected_indices": []
        }
    
    try:
        return json.loads(content)
    
    except Exception:
        return {
            "selected_indices": []
        }

    
    


def search(query: str):

    response = tinyfish.search.query(
        query,
        language="en"
    )

    results = []

    for idx, result in enumerate(
        response.results,
        start=1
    ):

        results.append({
            "index": idx,
            "title": result.title,
            "snippet": result.snippet,
            "url": result.url
        })

    if not results:
        return {
            "selected_indices": [],
            "results": []
        }
  
   
    llm_result = analyze_search_results(
        query=query,
        results=results
    )
  
    selected_indices = llm_result.get("selected_indices")
    if isinstance(selected_indices, str):
        selected_indices = [int(x) for x in selected_indices.replace(",", " ").split() if x.isdigit()]
    if isinstance(selected_indices, int):
        selected_indices = [selected_indices]
    if not isinstance(selected_indices, list):
        selected_indices = []
   
    parsed_indices = []
    for i in selected_indices:
        if isinstance(i, int):
            parsed_indices.append(i)
        elif isinstance(i, str) and i.isdigit():
            parsed_indices.append(int(i))

    selected_indices = [i for i in parsed_indices if 1 <= i <= len(results)]
    if not selected_indices:
        selected_indices = list(range(1, min(2, len(results)) + 1))
    selected_indices = selected_indices[:3]

    return {
        "selected_indices": selected_indices,
        "results": results
    }




## FETCH FUNCTION FOR AGENT

def get_favicon(url: str):

    domain = (
        urlparse(url)
        .netloc
        .replace("www.", "")
    )

    return (
        "https://www.google.com/s2/favicons"
        f"?domain={domain}&sz=64"
    )


def generate_web_answer(
    query: str,
    fetched_pages: list
):

    prompt = f"""
You are a web research assistant.

User Question:
{query}

Sources:
{fetched_pages}

Instructions:

- Answer the user's question using ONLY the provided sources.
- Combine information from multiple sources when useful.
- Give clear answer and whatever information is relevant.
- If you refer to a source, include its exact URL from the source data.
- If the sources do not contain enough information, clearly say so.
- Do NOT return JSON.
- Return only the final answer.
"""

    payload = {
        "model":
            "accounts/fireworks/models/gpt-oss-20b",

        "temperature": 0.2,

        "max_tokens": 2048,

        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    }

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization":
            f"Bearer {os.getenv('FIREWORKS_API_KEY')}"
    }

    response = requests.post(
        "https://api.fireworks.ai/inference/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=120
    )

    response.raise_for_status()

    return (
        response.json()
        ["choices"][0]
        ["message"]["content"]
        .strip()
    )


def fetch(
    query: str,
    selected_results: list
):

    searched_titles = [
        result["title"]
        for result in selected_results
    ]

    sources = []
    fetched_pages = []

    for result in selected_results:

        source = {
            "index":
                result["index"],

            "title":
                result["title"],

            "snippet":
                result["snippet"],

            "url":
                result["url"],

            "favicon":
                get_favicon(
                    result["url"]
                )
        }

        sources.append(source)

        try:

            extraction = (
                tinyfish.fetch.get_contents(
                    [result["url"]],
                    format="markdown"
                )
            )

            if not extraction.results:
                continue

            page = (
                extraction.results[0]
            )

            fetched_pages.append({
                "title":
                    result["title"],

                "url":
                    result["url"],

                "content":
                    (page.text or "")[:2000]
            })

        except Exception:
            continue

    if not fetched_pages:

        yield {
            "type": "final",
            "answer":
                (
                    "I could not retrieve enough "
                    "information from the selected sources."
                ),
            "sources":
                sources
        }

        return

    # Yield the top fetched page title before answer generation
    top_title = fetched_pages[0]["title"] if fetched_pages else ""
    if top_title:
        yield {
            "type": "status",
            "step": "web_fetch",
            "message": top_title
        }

    answer = generate_web_answer(
        query=query,
        fetched_pages=fetched_pages
    )

    yield {
        "type": "final",
        "answer":
            answer,
        "sources":
            sources
    }