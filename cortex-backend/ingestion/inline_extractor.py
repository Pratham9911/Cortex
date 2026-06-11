import re
import fitz  # pymupdf
from fastapi import HTTPException
from rag.chunker import chunk_text
from rag.embedder import generate_embeddings

def extract_and_embed_from_bytes(file_bytes: bytes, mime_type: str, filename: str) -> list[dict]:
    """
    Extracts text, chunks it, and generates embeddings from raw file bytes in memory.
    Returns a list of embedded chunk dicts ready to insert into DocumentChunk.
    Raises HTTPException on any validation, parsing, or embedding failure.
    """
    chunks = []

    # ----------------------------------------
    # 1. Extract & Chunk text based on mime type
    # ----------------------------------------
    if mime_type in ["text/plain", "text/markdown"]:
        try:
            document_text = file_bytes.decode("utf-8", errors="replace")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to decode text file: {str(e)}"
            )

        chunks = chunk_text(document_text)
        for chunk in chunks:
            chunk["page_number"] = 1

    elif mime_type == "application/pdf":
        try:
            doc = fitz.open(
                stream=file_bytes,
                filetype="pdf"
            )
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse PDF file: {str(e)}"
            )

        full_text = ""

        # Build global document text
        for page_num, page in enumerate(doc):
            page_text = page.get_text()
            full_text += f"\n[[PAGE_{page_num + 1}]]\n"
            full_text += page_text

        # Global chunking
        chunks = chunk_text(full_text)

        # Attach page metadata
        current_page = 1
        for chunk in chunks:
            page_matches = re.findall(
                r"\[\[PAGE_(\d+)\]\]",
                chunk["content"]
            )
            if page_matches:
                current_page = int(page_matches[0])

            chunk["page_number"] = current_page

            # remove markers before embedding/storage
            chunk["content"] = re.sub(
                r"\[\[PAGE_\d+\]\]",
                "",
                chunk["content"]
            ).strip()
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {mime_type}"
        )

    if not chunks:
        # Avoid empty content insertion errors / embedding API errors
        raise HTTPException(
            status_code=400,
            detail="No extractable text found in the document."
        )

    # ----------------------------------------
    # 2. Generate embeddings in batches of 20
    # ----------------------------------------
    try:
        embedded_chunks = generate_embeddings(chunks, batch_size=20)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Embedding generation failed: {str(e)}"
        )

    return embedded_chunks
