import os

from google import genai
from google.genai import types


client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY1")
)

MODEL_NAME = "gemini-embedding-2"


def generate_embeddings(chunks):

    texts = [chunk["content"] for chunk in chunks]

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

    embedded_chunks = []

    for index, embedding in enumerate(response.embeddings):

        embedded_chunks.append({
    "chunk_index": chunks[index]["chunk_index"],

    "content": chunks[index]["content"],

    "page_number": chunks[index].get("page_number"),

    "embedding": embedding.values
})

    return embedded_chunks