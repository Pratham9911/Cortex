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

Citation Rules:
- Use inline citations SPARINGLY: Include at most 1 or 2 citations per paragraph, major section, or table.
- Do NOT cite every single row, date, metric, or sentence. Over-citing cluttering the response must be avoided.
- MUST format inline citations as plain text without any code backticks, quotes, or formatting: [cite: doc_<document_id>:p<page_number>] (or [cite: doc_<document_id>] if page number is unavailable).
  Example: The project submission deadline is October 15, 2023 [cite: doc_12:p4].
- CRITICAL: Never wrap citation tags in backticks (do NOT write `[cite: doc_12:p4]`). Write plain [cite: doc_12:p4].
- NEVER use full-width or non-standard brackets (e.g. do NOT output `【` or `】`).
- NEVER invent document IDs or page numbers outside of the provided Project Context headers.
"""
)

generation_chain = (
    prompt
    | generator_llm
    | StrOutputParser()
)


def generate_answer(query: str, chunks):
    formatted_context_blocks = []

    for chunk in chunks:
        doc_id = chunk.get("document_id")
        page_num = chunk.get("page_number")

        if doc_id is None and isinstance(chunk.get("document"), dict):
            doc_id = chunk["document"].get("document_id")
        if page_num is None and isinstance(chunk.get("chunk"), dict):
            page_num = chunk["chunk"].get("page_number")

        header = f"[Source document_id={doc_id}"
        if page_num is not None:
            header += f", page={page_num}"
        header += "]"

        content = chunk.get("content", "")
        formatted_context_blocks.append(f"{header}\n{content}")

    context = "\n\n".join(formatted_context_blocks)

    return generation_chain.invoke(
        {
            "query": query,
            "context": context,
        }
    )