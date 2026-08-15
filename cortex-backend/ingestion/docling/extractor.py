import os
import re
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
os.environ["TORCH_COMPILE_DISABLE"] = "1"
os.environ["TORCHDYNAMO_DISABLE"] = "1"

from docling.document_converter import DocumentConverter
from docling_core.types.doc import (
    TextItem,
    TableItem,
    PictureItem,
    SectionHeaderItem,
)

from rag.chunker import chunk_text



SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".pptx",
    ".md",
    ".txt",
}


def extract_and_chunk(file_path: str | Path):

    file_path = Path(file_path)

    if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {file_path.suffix}"
        )

    print(f"\nConverting: {file_path}")

    converter = DocumentConverter()

    result = converter.convert(file_path)

    doc = result.document

    # ==================================================
    # BUILD ORDERED TEXT WITH PAGE MARKERS
    # ==================================================

    document_text = ""

    current_page = None

    for element, level in doc.iterate_items(
        traverse_pictures=True
    ):

        # ------------------------------------------------
        # Get page from Docling provenance
        # ------------------------------------------------

        prov = getattr(element, "prov", None)

        if prov:
            current_page = prov[0].page_no

        # ------------------------------------------------
        # SECTION HEADER
        #
        # IMPORTANT:
        # SectionHeaderItem MUST come before TextItem
        # because SectionHeaderItem inherits from TextItem.
        # ------------------------------------------------

        if isinstance(element, SectionHeaderItem):

            text = element.text

            heading_level = element.level

            if heading_level is None:
                heading_level = 1

            text = f"{'#' * heading_level} {text}"

        # ------------------------------------------------
        # NORMAL TEXT
        # ------------------------------------------------

        elif isinstance(element, TextItem):

            text = element.text

        # ------------------------------------------------
        # TABLE
        # ------------------------------------------------

        elif isinstance(element, TableItem):

            text = element.export_to_markdown(doc)

        # ------------------------------------------------
        # IMAGE
        # ------------------------------------------------

        elif isinstance(element, PictureItem):

            continue

        # ------------------------------------------------
        # OTHER
        # ------------------------------------------------

        else:

            continue

        if not text or not text.strip():
            continue

        # ------------------------------------------------
        # PAGE MARKER
        # ------------------------------------------------

        if current_page is not None:
          document_text += f"[[PAGE_{current_page}]]\n"
      
        document_text += text.strip()
        document_text += "\n"

    # ==================================================
    # DEBUG
    # ==================================================

    # print("\n========== BEFORE CHUNKING ==========")
    # print(document_text[:5000])
    print("docling text length:", len(document_text))

    # ==================================================
    # VALIDATION
    # ==================================================

    if not document_text.strip():

        raise ValueError(
            "No extractable text found in document."
        )

    # ==================================================
    # YOUR EXISTING CHUNKER
    # ==================================================

    chunks = chunk_text(document_text)

    # ==================================================
    # PAGE NUMBERS
    # ==================================================

    current_page = 1

    for chunk in chunks:

        content = chunk["content"]

        page_matches = re.findall(
            r"\[\[PAGE_(\d+)\]\]",
            content
        )

        if page_matches:

            current_page = int(
                page_matches[0]
            )

        chunk["page_number"] = current_page

        # Remove markers before storage/embedding

        chunk["content"] = re.sub(
            r"\[\[PAGE_\d+\]\]",
            "",
            content
        ).strip()

        
    if not chunks:
        raise ValueError(
            "No extractable text found in document."
        )
    
   
    return chunks