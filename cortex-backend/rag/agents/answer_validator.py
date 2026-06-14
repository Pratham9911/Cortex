import os
import json

from groq import Groq


client = Groq(
    api_key=os.getenv("GROQ_API_KEY2")
)


def validate_answer(
    query: str,
    answer: str
):

    prompt = f"""
You are an answer validation agent for an enterprise RAG system.

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

    try:

        result = json.loads(
            response.choices[0].message.content
        )

        decision = result.get("decision")

        if decision not in ["yes", "no"]:
            raise Exception()

        return result

    except Exception:

        return {
            "decision": "yes"
        }