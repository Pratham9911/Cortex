import os
import re
import requests
import fitz  # pymupdf

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from rag.chunker import chunk_text
from rag.embedder import generate_embeddings

from models import (
    Document,
    DocumentVersion,
    ProjectMember,
    DocumentChunk
)


def extract_text(document_id: int, user_id: int, db: Session):

    # ----------------------------------------
    # 1. Get document
    # ----------------------------------------
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # ----------------------------------------
    # 2. Check access
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ----------------------------------------
    # 3. Get active version
    # ----------------------------------------
    version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_active == True
    ).first()

    if not version:
        raise HTTPException(
            status_code=404,
            detail="No active version"
        )

    # ----------------------------------------
    # 4. Download file
    # ----------------------------------------
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    file_url = (
        f"{SUPABASE_URL}/storage/v1/object/documents/"
        f"{version.storage_path}"
    )

    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }

    response = requests.get(file_url, headers=headers)

    if response.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch file"
        )

    # ----------------------------------------
    # 5. Extract + Chunk
    # ----------------------------------------
    chunks = []

    # ----------------------------------------
    # TXT / MD
    # ----------------------------------------
    if version.mime_type in [
        "text/plain",
        "text/markdown"
    ]:

        document_text = response.text

        chunks = chunk_text(document_text)

        for chunk in chunks:
            chunk["page_number"] = 1

    # ----------------------------------------
    # PDF
    # ----------------------------------------
    elif version.mime_type == "application/pdf":

        pdf_bytes = response.content

        doc = fitz.open(
            stream=pdf_bytes,
            filetype="pdf"
        )

        full_text = ""

        # ----------------------------------------
        # Build global document text
        # ----------------------------------------
        for page_num, page in enumerate(doc):

            page_text = page.get_text()

            full_text += f"\n[[PAGE_{page_num + 1}]]\n"

            full_text += page_text

        # ----------------------------------------
        # Global chunking
        # ----------------------------------------
        chunks = chunk_text(full_text)

        # ----------------------------------------
        # Attach page metadata
        # ----------------------------------------
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
            detail="Unsupported file type"
        )

    # ----------------------------------------
    # 6. Generate embeddings
    # ----------------------------------------
    embedded_chunks = generate_embeddings(chunks)

    # ----------------------------------------
    # 7. Store chunks
    # ----------------------------------------
    for chunk in embedded_chunks:

        db_chunk = DocumentChunk(
            project_id=document.project_id,

            version_id=version.version_id,

            chunk_index=chunk["chunk_index"],

            content=chunk["content"],

            page_number=chunk.get("page_number"),

            embedding=chunk["embedding"]
        )

        db.add(db_chunk)

    db.commit()
    db.execute(text("""
    UPDATE document_chunks
    SET search_vector = to_tsvector('english', content)
    WHERE version_id = :version_id
"""), {
    "version_id": version.version_id
})

    db.commit()

    # ----------------------------------------
    # 8. Response
    # ----------------------------------------
    return {
        "message": "Chunks embedded and stored successfully",
        "document_id": document_id,
        "version": version.version_number,
        "total_chunks": len(embedded_chunks)
    }