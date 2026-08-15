import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


# --------------------------------------------------
# IMPORTANT:
# Set these BEFORE importing Docling / Torch
# --------------------------------------------------

import os

os.environ["TORCH_COMPILE_DISABLE"] = "1"
os.environ["TORCHDYNAMO_DISABLE"] = "1"


import asyncio
import signal
import shutil

from dotenv import load_dotenv
from bullmq import Worker
from supabase import create_client


from sqlalchemy import text, func
from database import SessionLocal

from models import (
    DocumentVersion,
    DocumentChunk,
)

from ingestion.docling.extractor import extract_and_chunk
from rag.embedder import generate_embeddings


load_dotenv()


REDIS_URL = os.getenv("REDIS_URL")

QUEUE_NAME = "document-ingestion"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)


# ============================================================
# PROCESS DOCUMENT
# ============================================================

async def process(job, job_token):

    print("\n==========================================")
    print("INGESTION JOB STARTED")
    print("==========================================")

    print("Job ID:", job.id)
    print("Job Name:", job.name)
    print("Job Data:", job.data)

    document_id = job.data["document_id"]
    version_id = job.data["version_id"]
    project_id = job.data["project_id"]
    storage_path = job.data["storage_path"]

    db = SessionLocal()

    # --------------------------------------------------
    # Version-specific working directory
    # --------------------------------------------------

    temp_dir = (
        Path("worker_temp")
        / f"document_{document_id}"
        / f"version_{version_id}"
    )

    local_path = None

    try:

        # ==================================================
        # 1. MARK PROCESSING
        # ==================================================

        version = db.query(DocumentVersion).filter(
            DocumentVersion.version_id == version_id
        ).first()

        if not version:
            raise RuntimeError(
                f"DocumentVersion {version_id} not found"
            )

        version.status = "processing"

        db.commit()

        # ==================================================
        # 2. DOWNLOAD FROM SUPABASE
        # ==================================================

        print("\n========== DOWNLOAD ==========")

        print(
            "Storage path:",
            storage_path
        )

        file_bytes = (
            supabase.storage
            .from_("documents")
            .download(storage_path)
        )

        print(
            "Downloaded:",
            len(file_bytes),
            "bytes"
        )

        # ==================================================
        # 3. UNIQUE LOCAL FILE
        # ==================================================

        temp_dir.mkdir(
            parents=True,
            exist_ok=True
        )

        file_name = Path(
            storage_path
        ).name

        local_path = temp_dir / file_name

        local_path.write_bytes(
            file_bytes
        )

        print(
            "Local file:",
            local_path.resolve()
        )

        # ==================================================
        # 4. DOCLING + CHUNKING
        # ==================================================

        print(
            "\n========== EXTRACTION + CHUNKING =========="
        )

        # IMPORTANT:
        # extract_and_chunk() ONLY extracts and chunks.
        #
        # It does NOT generate embeddings.

        chunks = await asyncio.to_thread(
            extract_and_chunk,
            local_path
        )

        if not chunks:

            raise RuntimeError(
                "No chunks were generated"
            )

        print(
            "Chunks generated:",
            len(chunks)
        )

        # ==================================================
        # 5. EMBEDDINGS
        # ==================================================

        print(
            "\n========== EMBEDDING =========="
        )

        # IMPORTANT:
        # generate_embeddings() receives the chunks
        # produced by extract_and_chunk() and returns:
        #
        # chunk_index
        # content
        # page_number
        # embedding

        embedded_chunks = await asyncio.to_thread(
            generate_embeddings,
            chunks,
            20
        )

        if not embedded_chunks:

            raise RuntimeError(
                "No embedded chunks were generated"
            )

        print(
            "Embedded chunks:",
            len(embedded_chunks)
        )

        # ==================================================
        # 6. DATABASE INSERT
        # ==================================================

        print(
            "\n========== DATABASE INSERT =========="
        )

        # Make sure this version does not already contain
        # chunks. This makes the worker safer if a job
        # somehow gets processed again.

        existing_chunks = db.query(
            DocumentChunk
        ).filter(
            DocumentChunk.version_id == version_id
        ).count()

        if existing_chunks > 0:

            print(
                f"Version already contains "
                f"{existing_chunks} chunks."
            )

            raise RuntimeError(
                "Document version already contains chunks"
            )

        # --------------------------------------------------
        # Insert embedded chunks
        # --------------------------------------------------

        for chunk in embedded_chunks:

            db_chunk = DocumentChunk(

                project_id=project_id,

                version_id=version_id,

                chunk_index=chunk["chunk_index"],

                content=chunk["content"],

                page_number=chunk.get(
                    "page_number"
                ),

                embedding=chunk["embedding"]
            )

            db.add(db_chunk)

        db.flush()

        # ==================================================
        # 7. UPDATE SEARCH VECTOR
        # ==================================================

        db.execute(
            text("""
                UPDATE document_chunks
                SET search_vector =
                    to_tsvector(
                        'english',
                        content
                    )
                WHERE version_id = :version_id
            """),
            {
                "version_id": version_id
            }
        )

        # ==================================================
        # 8. MARK VERSION COMPLETED
        # ==================================================

        version.status = "completed"

        db.flush()

        # ==================================================
        # 9. ACTIVATE LATEST COMPLETED VERSION
        # ==================================================

        # IMPORTANT:
        #
        # New versions are created with:
        #
        #     is_active = False
        #
        # The old active version remains active while the
        # new version is pending/processing.
        #
        # Only after successful ingestion do we determine
        # which completed version should be active.
        #
        # This also protects against:
        #
        # V1 active
        # V2 processing
        # V3 processing
        #
        # If V3 completes first, V3 becomes active.
        #
        # If V2 completes afterwards, V3 remains active
        # because V3 has the higher version number.

        latest_completed_version = db.query(
            DocumentVersion
        ).filter(
            DocumentVersion.document_id == document_id,
            DocumentVersion.is_deleted == False,
            DocumentVersion.status == "completed"
        ).order_by(
            DocumentVersion.version_number.desc()
        ).first()

        if not latest_completed_version:

            raise RuntimeError(
                "No completed version found"
            )

        # --------------------------------------------------
        # Deactivate currently active versions except
        # the latest completed version.
        # --------------------------------------------------

        active_versions = db.query(
            DocumentVersion
        ).filter(
            DocumentVersion.document_id == document_id,
            DocumentVersion.is_active == True,
            DocumentVersion.is_deleted == False,
            DocumentVersion.version_id !=
                latest_completed_version.version_id
        ).all()

        for active_version in active_versions:

            active_version.is_active = False

        # --------------------------------------------------
        # Activate latest completed version
        # --------------------------------------------------

        latest_completed_version.is_active = True

        latest_completed_version.activated_by = (
            latest_completed_version.uploaded_by
        )

        latest_completed_version.activated_at = (
            func.now()
        )

        db.flush()

        # ==================================================
        # 10. COMMIT
        # ==================================================

        db.commit()

        print(
            "\n=========================================="
        )

        print(
            "INGESTION COMPLETED"
        )

        print(
            "=========================================="
        )

        print(
            "Document:",
            document_id
        )

        print(
            "Version:",
            version_id
        )

        print(
            "Chunks:",
            len(embedded_chunks)
        )

        print(
            "Active version:",
            latest_completed_version.version_number
        )

        return {
            "status": "completed",
            "document_id": document_id,
            "version_id": version_id,
            "chunks": len(embedded_chunks),
            "active_version":
                latest_completed_version.version_number
        }

    # ======================================================
    # FAILURE
    # ======================================================

    except Exception as e:

        print(
            "\n=========================================="
        )

        print(
            "INGESTION FAILED"
        )

        print(
            "=========================================="
        )

        print(
            "Document:",
            document_id
        )

        print(
            "Version:",
            version_id
        )

        print(
            "Error:",
            str(e)
        )

        db.rollback()

        # --------------------------------------------------
        # Mark failed
        #
        # If BullMQ retries, the next attempt will change
        # it back to processing at the beginning.
        # --------------------------------------------------

        try:

            version = db.query(
                DocumentVersion
            ).filter(
                DocumentVersion.version_id == version_id
            ).first()

            if version:

                version.status = "failed"

                # A failed version must never become active.
                version.is_active = False

                db.commit()

                print(
                    f"Version {version_id} → failed"
                )

        except Exception as status_error:

            db.rollback()

            print(
                "Failed to update document status:",
                status_error
            )

        # VERY IMPORTANT:
        # Re-raise the exception.
        #
        # BullMQ needs the exception to know that the
        # job failed and should be retried.

        raise

    finally:

        # ==================================================
        # 11. CLOSE DB
        # ==================================================

        db.close()

        # ==================================================
        # 12. DELETE VERSION TEMP DIRECTORY
        # ==================================================

        if temp_dir.exists():

            try:

                shutil.rmtree(
                    temp_dir
                )

                print(
                    "Temporary version directory cleaned:"
                )

                print(
                    temp_dir
                )

            except Exception as cleanup_error:

                print(
                    "Temporary cleanup failed:",
                    cleanup_error
                )

# ============================================================
# WORKER
# ============================================================

async def main():

    shutdown_event = asyncio.Event()

    def signal_handler(sig, frame):

        print(
            "Shutdown signal received"
        )

        shutdown_event.set()

    signal.signal(
        signal.SIGINT,
        signal_handler
    )

    signal.signal(
        signal.SIGTERM,
        signal_handler
    )

    worker = Worker(
        QUEUE_NAME,
        process,
        {
            "connection": REDIS_URL,

            # Keep concurrency controlled because
            # Docling is CPU/memory heavy.
            "concurrency": 1,
        }
    )

    print(
        f"Worker listening on queue: {QUEUE_NAME}"
    )

    await shutdown_event.wait()

    print(
        "Closing worker..."
    )

    await worker.close()

    print(
        "Worker stopped"
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    asyncio.run(main())