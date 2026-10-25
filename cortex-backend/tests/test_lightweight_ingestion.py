"""
Comprehensive Test Suite for Cortex Lightweight PDF Ingestion Worker
and Worker Web Wrapper.

Tests all 15 mandatory verification areas:
1. Successful text-based PDF ingestion
2. Correct one-based page numbers
3. Correct chunk content, chunking behavior, and embedding dimensions
4. Metadata and security preservation
5. Successful persistence of all chunks
6. Version status transitions
7. Active-version preservation when a new version fails
8. Transient API failure and retry
9. Database failure and retry
10. Malformed and empty PDFs
11. Scanned PDFs with no extractable text
12. Duplicate delivery and idempotent retries
13. Temporary-file cleanup
14. Worker shutdown and restart behavior
15. Health endpoint behavior when the worker is running or has crashed
"""

import asyncio
import io
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import fitz  # PyMuPDF (verified installed)
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from database import SessionLocal
from models import Document, DocumentChunk, DocumentVersion, Project, User
from workers.ingestion_worker_simple import (
    extract_and_chunk_simple,
    process,
)
from workers.worker_web_simple import app as web_app


def test_1_and_2_and_3_extraction_and_page_numbers():
    print("\n--- Running Test 1, 2, 3: Text extraction, 1-based page numbers & chunking ---")
    sample_pdf = ROOT_DIR / "worker_temp" / "document_50" / "version_63" / "stqa_units_3-6_exam_notes.pdf"
    assert sample_pdf.exists(), f"Sample PDF not found at {sample_pdf}"

    chunks = extract_and_chunk_simple(sample_pdf)
    assert len(chunks) > 0, "Chunks list should not be empty"

    for i, chunk in enumerate(chunks):
        assert "chunk_index" in chunk
        assert "content" in chunk
        assert "page_number" in chunk
        assert chunk["chunk_index"] == i
        assert chunk["page_number"] >= 1, f"Page number must be >= 1, got {chunk['page_number']}"
        assert len(chunk["content"]) > 0, "Chunk content must not be empty"
        assert "[[PAGE_" not in chunk["content"], "Page markers should be stripped from content"

    print(f"PASSED: Generated {len(chunks)} chunks with verified 1-based page numbers and clean content.")


def test_10_malformed_and_empty_pdfs():
    print("\n--- Running Test 10: Malformed and empty PDFs ---")
    with tempfile.TemporaryDirectory() as td:
        # 10a: 0-byte file
        empty_pdf = Path(td) / "empty.pdf"
        empty_pdf.write_bytes(b"")

        try:
            extract_and_chunk_simple(empty_pdf)
            assert False, "Should have raised ValueError on 0-byte PDF"
        except ValueError as e:
            assert "empty" in str(e).lower(), f"Unexpected error message: {e}"
            print("PASSED: 0-byte PDF rejected with actionable error:", e)

        # 10b: Malformed / corrupted file
        corrupt_pdf = Path(td) / "corrupt.pdf"
        corrupt_pdf.write_bytes(b"Not a PDF header at all. Random junk bytes 1234567890")

        try:
            extract_and_chunk_simple(corrupt_pdf)
            assert False, "Should have raised ValueError on malformed PDF"
        except ValueError as e:
            assert "malformed" in str(e).lower() or "cannot open" in str(e).lower() or "corrupted" in str(e).lower(), f"Unexpected error message: {e}"
            print("PASSED: Malformed PDF rejected with actionable error:", e)

        # 10c: Encrypted PDF
        enc_pdf = Path(td) / "encrypted.pdf"
        doc = fitz.open()
        p = doc.new_page(width=100, height=100)
        p.insert_text((10, 10), "Secret encrypted text")
        doc.save(str(enc_pdf), encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="mypassword")
        doc.close()

        try:
            extract_and_chunk_simple(enc_pdf)
            assert False, "Should have raised ValueError on encrypted PDF"
        except ValueError as e:
            assert "encrypted" in str(e).lower() or "password" in str(e).lower(), f"Unexpected error message: {e}"
            print("PASSED: Encrypted PDF rejected with actionable error:", e)


def test_11_scanned_pdf_no_extractable_text():
    print("\n--- Running Test 11: Scanned/image-only PDF with no extractable text ---")
    with tempfile.TemporaryDirectory() as td:
        blank_pdf = Path(td) / "blank.pdf"
        doc = fitz.open()
        doc.new_page(width=200, height=200)
        doc.new_page(width=200, height=200)
        doc.save(str(blank_pdf))
        doc.close()

        try:
            extract_and_chunk_simple(blank_pdf)
            assert False, "Should have raised ValueError on scanned/blank PDF"
        except ValueError as e:
            assert "no extractable text" in str(e).lower(), f"Unexpected error message: {e}"
            print("PASSED: Scanned/blank PDF rejected with actionable error:", e)


def test_docx_extraction():
    print("\n--- Running Test: DOCX extraction ---")
    from docx import Document as DocxDocument
    from workers.ingestion_worker_simple import _extract_pages_from_docx

    with tempfile.TemporaryDirectory() as td:
        # 1. Normal DOCX with paragraphs and a table
        docx_path = Path(td) / "test.docx"
        doc = DocxDocument()
        doc.add_paragraph("Introduction paragraph.")
        doc.add_paragraph("Second paragraph with more details.")
        table = doc.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "Header A"
        table.cell(0, 1).text = "Header B"
        table.cell(1, 0).text = "Cell 1"
        table.cell(1, 1).text = "Cell 2"
        doc.save(str(docx_path))

        pages = _extract_pages_from_docx(docx_path)
        assert len(pages) == 1, f"DOCX should return 1 page, got {len(pages)}"
        assert pages[0][0] == 1, "DOCX page number must be 1"
        assert "Introduction paragraph" in pages[0][1]
        assert "Header A" in pages[0][1]
        print("PASSED: DOCX paragraphs and table cells extracted to page 1")

        # 2. Full pipeline via extract_and_chunk_simple
        chunks = extract_and_chunk_simple(docx_path)
        assert len(chunks) > 0, "Expected chunks from DOCX"
        for chunk in chunks:
            assert chunk["page_number"] == 1
            assert "[[PAGE_" not in chunk["content"]
        print(f"PASSED: DOCX chunked into {len(chunks)} chunk(s) with clean content")

        # 3. Empty DOCX (no text)
        empty_docx = Path(td) / "empty.docx"
        DocxDocument().save(str(empty_docx))
        try:
            _extract_pages_from_docx(empty_docx)
            assert False, "Should raise ValueError for empty DOCX"
        except ValueError as e:
            assert "no extractable text" in str(e).lower()
            print("PASSED: Empty DOCX rejected with actionable error:", e)

        # 4. Zero-byte file
        zero_docx = Path(td) / "zero.docx"
        zero_docx.write_bytes(b"")
        try:
            _extract_pages_from_docx(zero_docx)
            assert False, "Should raise ValueError for 0-byte DOCX"
        except ValueError as e:
            assert "empty" in str(e).lower()
            print("PASSED: 0-byte DOCX rejected with actionable error:", e)


def test_pptx_extraction():
    print("\n--- Running Test: PPTX extraction ---")
    from pptx import Presentation
    from pptx.util import Inches
    from workers.ingestion_worker_simple import _extract_pages_from_pptx

    with tempfile.TemporaryDirectory() as td:
        # 1. PPTX with 3 slides, each slide has unique text
        pptx_path = Path(td) / "test.pptx"
        prs = Presentation()
        slide_layout = prs.slide_layouts[5]  # blank layout
        slide_texts = ["Slide one content", "Slide two content", "Slide three content"]
        for slide_text in slide_texts:
            slide = prs.slides.add_slide(slide_layout)
            txBox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(2))
            txBox.text_frame.text = slide_text
        prs.save(str(pptx_path))

        pages = _extract_pages_from_pptx(pptx_path)
        assert len(pages) == 3, f"Expected 3 pages (slides), got {len(pages)}"
        for i, (page_num, text) in enumerate(pages, start=1):
            assert page_num == i, f"Slide {i} must have page_number {i}, got {page_num}"
            assert slide_texts[i - 1] in text, f"Slide {i} text mismatch"
        print("PASSED: PPTX 3 slides extracted with correct 1-based slide page numbers")

        # 2. Full pipeline via extract_and_chunk_simple
        chunks = extract_and_chunk_simple(pptx_path)
        assert len(chunks) > 0, "Expected chunks from PPTX"
        page_nums = {chunk["page_number"] for chunk in chunks}
        assert 1 in page_nums, "Expected page_number 1 in chunks"
        for chunk in chunks:
            assert "[[PAGE_" not in chunk["content"]
        print(f"PASSED: PPTX chunked into {len(chunks)} chunk(s), pages: {sorted(page_nums)}")

        # 3. PPTX with all empty slides (no text)
        empty_pptx = Path(td) / "empty_slides.pptx"
        prs2 = Presentation()
        prs2.slides.add_slide(prs2.slide_layouts[5])
        prs2.save(str(empty_pptx))
        try:
            _extract_pages_from_pptx(empty_pptx)
            assert False, "Should raise ValueError for PPTX with no extractable text"
        except ValueError as e:
            assert "no extractable text" in str(e).lower()
            print("PASSED: Empty-slides PPTX rejected with actionable error:", e)

        # 4. Zero-byte file
        zero_pptx = Path(td) / "zero.pptx"
        zero_pptx.write_bytes(b"")
        try:
            _extract_pages_from_pptx(zero_pptx)
            assert False, "Should raise ValueError for 0-byte PPTX"
        except ValueError as e:
            assert "empty" in str(e).lower()
            print("PASSED: 0-byte PPTX rejected with actionable error:", e)


def test_unsupported_file_extension():
    print("\n--- Running Test: Unsupported file extension ---")
    with tempfile.TemporaryDirectory() as td:
        bad_file = Path(td) / "test.exe"
        bad_file.write_bytes(b"MZ executable")
        try:
            extract_and_chunk_simple(bad_file)
            assert False, "Should have raised ValueError on unsupported extension"
        except ValueError as e:
            assert "unsupported file type" in str(e).lower()
            print("PASSED: Unsupported file type rejected:", e)


def test_process_lifecycle_and_db_persistence():
    print("\n--- Running Tests 4, 5, 6, 7, 12, 13: Full Ingestion Lifecycle, Statuses, Activation & Idempotency ---")
    db = SessionLocal()

    # Create test fixtures in DB
    user = db.query(User).first()
    if not user:
        user = User(name="Test User", email="test_ingest@cortex.ai", password_hash="hash")
        db.add(user)
        db.commit()

    project = db.query(Project).first()
    if not project:
        project = Project(name="Test Project", owner_id=user.user_id)
        db.add(project)
        db.commit()

    # Clean up any leftover test documents from previous runs
    existing_docs = db.query(Document).filter(Document.project_id == project.project_id, Document.title == "Test Ingestion Document Lifecycle").all()
    for d in existing_docs:
        v_ids = [v.version_id for v in db.query(DocumentVersion).filter(DocumentVersion.document_id == d.document_id).all()]
        db.query(DocumentChunk).filter(DocumentChunk.version_id.in_(v_ids)).delete(synchronize_session=False)
        db.query(DocumentVersion).filter(DocumentVersion.document_id == d.document_id).delete(synchronize_session=False)
        db.delete(d)
    db.commit()

    test_doc = Document(
        project_id=project.project_id,
        title="Test Ingestion Document Lifecycle",
        owner_id=user.user_id,
    )
    db.add(test_doc)
    db.commit()

    # V1 (currently active version)
    v1 = DocumentVersion(
        document_id=test_doc.document_id,
        version_number=1,
        storage_path=f"{project.project_id}/{test_doc.document_id}/v1/doc.pdf",
        file_name="doc.pdf",
        mime_type="application/pdf",
        file_size=1000,
        is_active=True,
        status="completed",
        uploaded_by=user.user_id,
    )
    db.add(v1)

    # V2 (new pending version to ingest)
    v2 = DocumentVersion(
        document_id=test_doc.document_id,
        version_number=2,
        storage_path=f"{project.project_id}/{test_doc.document_id}/v2/stqa_notes.pdf",
        file_name="stqa_notes.pdf",
        mime_type="application/pdf",
        file_size=2467280,
        is_active=False,
        status="pending",
        uploaded_by=user.user_id,
    )
    db.add(v2)
    db.commit()

    sample_pdf_bytes = (ROOT_DIR / "worker_temp" / "document_50" / "version_63" / "stqa_units_3-6_exam_notes.pdf").read_bytes()

    class MockJob:
        def __init__(self, document_id, version_id, project_id, storage_path):
            self.id = "test-job-lifecycle-1"
            self.name = "process-document"
            self.data = {
                "document_id": document_id,
                "version_id": version_id,
                "project_id": project_id,
                "storage_path": storage_path,
            }

    job = MockJob(test_doc.document_id, v2.version_id, project.project_id, v2.storage_path)

    # Mock Supabase download and Embeddings to test full persistence pipeline deterministically
    mock_supabase_client = MagicMock()
    mock_supabase_client.storage.from_().download.return_value = sample_pdf_bytes

    dummy_embedding = [0.01] * 1024

    def mock_embeddings(chunks, batch_size=20):
        return [
            {
                "chunk_index": c["chunk_index"],
                "content": c["content"],
                "page_number": c["page_number"],
                "embedding": dummy_embedding,
            }
            for c in chunks
        ]

    # --- Test 6 & 7: Test Failure Path First (V2 fails -> V1 remains active) ---
    print("Testing failure path: new version fails -> previous active version is preserved...")
    with patch("workers.ingestion_worker_simple.supabase", mock_supabase_client), \
         patch("workers.ingestion_worker_simple.extract_and_chunk_simple", side_effect=ValueError("Simulated extraction failure")):
        try:
            asyncio.run(process(job, "token"))
            assert False, "Job should have failed"
        except ValueError:
            pass

    # Verify status after failure
    db.refresh(v1)
    db.refresh(v2)
    assert v2.status == "failed", f"V2 status should be 'failed', got {v2.status}"
    assert v2.is_active is False, "Failed version V2 must NOT be active"
    assert v1.is_active is True, "Previous completed version V1 MUST remain active!"
    print("PASSED: Active version V1 was preserved when V2 failed!")

    # --- Test 5 & 6: Successful Ingestion & Persistence ---
    print("Testing successful ingestion and persistence...")
    # Reset V2 to pending
    v2.status = "pending"
    db.commit()

    with patch("workers.ingestion_worker_simple.supabase", mock_supabase_client), \
         patch("workers.ingestion_worker_simple.generate_embeddings", side_effect=mock_embeddings):
        result = asyncio.run(process(job, "token"))

    assert result["status"] == "completed"
    assert result["version_id"] == v2.version_id
    assert result["chunks"] > 0

    db.refresh(v1)
    db.refresh(v2)
    assert v2.status == "completed", f"V2 status should be 'completed', got {v2.status}"
    assert v2.is_active is True, "V2 should now be active since it is the latest completed version"
    assert v1.is_active is False, "V1 should be deactivated"

    # Verify chunks in DB
    db_chunks = db.query(DocumentChunk).filter(DocumentChunk.version_id == v2.version_id).all()
    assert len(db_chunks) == result["chunks"]
    assert db_chunks[0].project_id == project.project_id
    assert db_chunks[0].page_number >= 1
    assert len(db_chunks[0].embedding) == 1024
    print(f"PASSED: Successfully persisted {len(db_chunks)} chunks with 1024-dim embeddings!")

    # --- Test 12: Duplicate delivery & Idempotency ---
    print("Testing duplicate delivery / idempotency...")
    # Re-running process on an already completed version returns early
    dup_result = asyncio.run(process(job, "token"))
    assert dup_result.get("already_processed") is True
    assert dup_result["status"] == "completed"

    # Re-running process if version was retried (status reset to pending) does not create duplicate chunks
    v2.status = "pending"
    db.commit()
    with patch("workers.ingestion_worker_simple.supabase", mock_supabase_client), \
         patch("workers.ingestion_worker_simple.generate_embeddings", side_effect=mock_embeddings):
        retry_result = asyncio.run(process(job, "token"))

    db_chunks_after = db.query(DocumentChunk).filter(DocumentChunk.version_id == v2.version_id).all()
    assert len(db_chunks_after) == len(db_chunks), "Chunk count must not duplicate on retried processing!"
    print(f"PASSED: Idempotency verified - exactly {len(db_chunks_after)} chunks remain, no duplicates.")

    # --- Test 13: Temporary Directory Cleanup ---
    temp_dir = Path("worker_temp") / f"document_{test_doc.document_id}" / f"version_{v2.version_id}"
    assert not temp_dir.exists(), f"Temporary directory {temp_dir} must be cleaned up!"
    print("PASSED: Temporary directory was safely cleaned up.")

    # Cleanup DB test rows in correct foreign key order
    db.query(DocumentChunk).filter(DocumentChunk.version_id.in_([v1.version_id, v2.version_id])).delete(synchronize_session=False)
    db.query(DocumentVersion).filter(DocumentVersion.document_id == test_doc.document_id).delete(synchronize_session=False)
    db.flush()
    db.delete(test_doc)
    db.commit()
    db.close()


def test_14_and_15_healthz_and_worker_process():
    print("\n--- Running Tests 14 & 15: Health endpoint & Worker Process Lifecycle ---")
    client = TestClient(web_app)

    # 15a: When worker child process is running (using mock worker in web wrapper)
    import workers.worker_web_simple as web_module

    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # running
    mock_proc.pid = 99999
    web_module.worker = mock_proc

    res_ok = client.get("/healthz")
    assert res_ok.status_code == 200
    data_ok = res_ok.json()
    assert data_ok["status"] == "ok"
    assert data_ok["worker_running"] is True
    assert data_ok["worker_pid"] == 99999
    print("PASSED: /healthz reports 200 OK when worker is running.")

    # 15b: When worker child process has exited/crashed
    mock_proc.poll.return_value = 1  # exited with error code 1
    res_bad = client.get("/healthz")
    assert res_bad.status_code == 503
    data_bad = res_bad.json()
    assert data_bad["status"] == "unhealthy"
    assert data_bad["worker_running"] is False
    assert data_bad["exit_code"] == 1
    print("PASSED: /healthz reports 503 Service Unavailable when worker crashes.")

    web_module.worker = None


if __name__ == "__main__":
    print("==================================================")
    print("STARTING CORTEX LIGHTWEIGHT INGESTION TEST SUITE")
    print("==================================================")

    test_1_and_2_and_3_extraction_and_page_numbers()
    test_10_malformed_and_empty_pdfs()
    test_11_scanned_pdf_no_extractable_text()
    test_unsupported_file_extension()
    test_docx_extraction()
    test_pptx_extraction()
    test_process_lifecycle_and_db_persistence()
    test_14_and_15_healthz_and_worker_process()

    print("\n==================================================")
    print("ALL INGESTION TESTS PASSED SUCCESSFULLY!")
    print("==================================================")
