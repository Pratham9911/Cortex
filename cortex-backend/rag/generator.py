import os
import json
import urllib.request


FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_CHAT_COMPLETIONS_URL = (
    "https://api.fireworks.ai/inference/v1/chat/completions"
)
FIREWORKS_GENERATOR_MODEL = "accounts/fireworks/models/gpt-oss-120b"


def generate_answer(query: str, chunks):

    context = "\n\n".join(
        [chunk["content"] for chunk in chunks]
    )

    prompt = f"""
You are an enterprise AI knowledge assistant.

Your task is to answer the user's question using ONLY the provided project context.

Instructions:
- Give detailed and well-structured answers.
- Combine information from multiple retrieved chunks if needed.
- Use bullet points when appropriate.
- Explain clearly and professionally.
- Do not invent information outside the provided context.
- If information is missing, explicitly say so.

Project Context:
{context}

User Question:
{query}
"""

    if not FIREWORKS_API_KEY:
        raise RuntimeError("FIREWORKS_API_KEY environment variable is required")

    payload = {
        "model": FIREWORKS_GENERATOR_MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0
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

    with urllib.request.urlopen(request, timeout=60) as response:
        response_data = json.loads(response.read().decode("utf-8"))

    return response_data["choices"][0]["message"]["content"]


