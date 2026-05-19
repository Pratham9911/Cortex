import os

from groq import Groq


client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


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

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0
    )

    return response.choices[0].message.content