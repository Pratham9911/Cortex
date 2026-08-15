import os

import requests

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")

FIREWORKS_EMBEDDING_URL = "https://api.fireworks.ai/inference/v1/embeddings"
MODEL_NAME = "fireworks/qwen3-embedding-8b"


def generate_embeddings(chunks, batch_size=20):
    if not chunks:
        return []

    embedded_chunks = []

    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json"
    }

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]

        texts = [
            chunk["content"]
            for chunk in batch
        ]

        payload = {
            "model": MODEL_NAME,
            "input": texts,
            "dimensions": 1024
        }

        response = requests.post(
            FIREWORKS_EMBEDDING_URL,
            headers=headers,
            json=payload
        )

        response.raise_for_status()

        result = response.json()

        embeddings = result["data"]

        # Make sure embeddings correspond to the
        # same order as the input chunks.
        embeddings = sorted(
            embeddings,
            key=lambda item: item["index"]
        )

        for index, item in enumerate(embeddings):

            embedded_chunks.append({
                "chunk_index": batch[index]["chunk_index"],
                "content": batch[index]["content"],
                "page_number": batch[index].get("page_number"),
                "embedding": item["embedding"]
            })

    return embedded_chunks

from google import genai
from google.genai import types


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY1")

client = None

if GEMINI_API_KEY:
    client = genai.Client(
        api_key=GEMINI_API_KEY
    )

MODEL_NAME_old = "gemini-embedding-2"


def generate_embeddings_old(chunks, batch_size=20):
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
            model=MODEL_NAME_old,
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