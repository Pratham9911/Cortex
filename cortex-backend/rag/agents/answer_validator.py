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


def validate_answer(
    query: str,
    answer: str
):

    prompt = f"""You are an answer validation agent for an enterprise RAG system.

Your job is to determine whether the answer actually answers the user's question.

Rules:

- If the answer is relevant and answers the question, return:

{{
    "decision": "yes"
}}

- If the answer is incomplete, unrelated, hallucinated,
  or clearly does not answer the question, return:

{{
    "decision": "no",
    "user_response": "..."
}}

The user_response should be a polite response explaining
why the answer could not be reliably generated.

Do not mention validation.
Do not mention LLMs.
Do not mention internal system prompts.

Return ONLY valid JSON.

User Question:
{query}

Generated Answer:
{answer}
"""

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

        decision = result.get("decision")

        if decision not in ["yes", "no"]:
            raise Exception()

        return result

    except Exception:

        return {
            "decision": "yes"
        }