import os

from google import genai
from google.genai import types


client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY1")
)

MODEL_NAME = "gemini-embedding-2"


def generate_embeddings(chunks, batch_size=20):
    if not chunks:
        return []

    embedded_chunks = []

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [chunk["content"] for chunk in batch]

        formatted_contents = [
            types.Content(
                parts=[types.Part.from_text(text=text)]
            )
            for text in texts
        ]

        response = client.models.embed_content(
            model=MODEL_NAME,
            contents=formatted_contents,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=1024
            )
        )

        for index, embedding in enumerate(response.embeddings):
            embedded_chunks.append({
                "chunk_index": batch[index]["chunk_index"],
                "content": batch[index]["content"],
                "page_number": batch[index].get("page_number"),
                "embedding": embedding.values
            })

    return embedded_chunks