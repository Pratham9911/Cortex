# 
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_fireworks import ChatFireworks
import os


FIREWORKS_GENERATOR_MODEL = "accounts/fireworks/models/gpt-oss-120b"


generator_llm = ChatFireworks(
    model=FIREWORKS_GENERATOR_MODEL,
    temperature=0,
    api_key=os.getenv("FIREWORKS_API_KEY")
)


prompt = PromptTemplate.from_template(
    """
Project Context:
{context}

User Question:
{query}

You are an enterprise AI knowledge assistant.

Your task is to answer the user's question using ONLY the provided project context.

Instructions:
- Give detailed and well-structured answers.
- MUST format your response using standard Markdown (e.g., headings, tables, bullet points, blockquotes).
- Combine information from multiple retrieved chunks if needed.
- Use bullet points or tables when appropriate.
- Explain clearly and professionally.
- Do not invent information outside the provided context.
- If information is missing, explicitly say so.
- You will be evaluated on correctness, groundedness, and relevance, so answer only what is supported by the context.
"""
)

generation_chain = (
    prompt
    | generator_llm
    | StrOutputParser()
)


def generate_answer(query: str, chunks):

    context = "\n\n".join(
        chunk["content"]
        for chunk in chunks
    )

    return generation_chain.invoke(
        {
            "query": query,
            "context": context,
        }
    )