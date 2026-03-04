"""Document extraction (PDF/Word/PPT) using Docling with fallback."""

import hashlib
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


async def extract_document(file_path: str, mime_type: str | None = None) -> dict:
    """
    Extract text and structure from a document file.

    Returns:
        {
            "text": str,
            "title": str,
            "content_hash": str,
            "metadata": dict,
            "docling_document": object | None,  # Docling Document for chunking
        }
    """
    try:
        return await _extract_with_docling(file_path)
    except ImportError:
        logger.warning("docling not installed, falling back to basic extraction")
        return await _extract_basic(file_path, mime_type)
    except Exception as e:
        logger.warning(f"docling failed ({e}), falling back to basic extraction")
        return await _extract_basic(file_path, mime_type)


async def _extract_with_docling(file_path: str) -> dict:
    """Use Docling for high-quality document parsing."""
    import asyncio
    from docling.document_converter import DocumentConverter

    # Docling is sync, run in thread pool
    def _convert():
        converter = DocumentConverter()
        result = converter.convert(file_path)
        return result

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _convert)

    doc = result.document
    text = doc.export_to_markdown()
    title = doc.name or Path(file_path).stem

    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

    # Count pages if available
    pages = None
    if hasattr(doc, "pages"):
        pages = len(doc.pages)

    return {
        "text": text,
        "title": title,
        "content_hash": content_hash,
        "metadata": {
            "extractor": "docling",
            "pages": pages,
            "mime_type": _guess_mime(file_path),
        },
        "docling_document": doc,
    }


async def _extract_basic(file_path: str, mime_type: str | None = None) -> dict:
    """Fallback: basic text extraction."""
    path = Path(file_path)
    suffix = path.suffix.lower()
    text = ""

    if suffix in (".txt", ".md"):
        text = path.read_text(encoding="utf-8", errors="replace")
    elif suffix == ".pdf":
        try:
            import pymupdf
            doc = pymupdf.open(file_path)
            text = "\n\n".join(page.get_text() for page in doc)
            doc.close()
        except ImportError:
            text = f"[PDF file: {path.name} — install pymupdf for extraction]"
    else:
        text = f"[Unsupported file type: {suffix}]"

    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

    return {
        "text": text,
        "title": path.stem,
        "content_hash": content_hash,
        "metadata": {
            "extractor": "basic-fallback",
            "mime_type": mime_type or _guess_mime(file_path),
        },
        "docling_document": None,
    }


def _guess_mime(file_path: str) -> str:
    suffix = Path(file_path).suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".txt": "text/plain",
        ".md": "text/markdown",
    }.get(suffix, "application/octet-stream")
