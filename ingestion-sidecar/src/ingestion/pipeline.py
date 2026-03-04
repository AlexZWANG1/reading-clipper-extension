"""Main ingestion pipeline — orchestrates extraction, chunking, embedding, and DB writes."""

import hashlib
import logging

from . import db
from .chunker import chunk_document
from .embedder import embed_texts, get_embedding_model_name
from .extractors.url_extractor import extract_url
from .extractors.doc_extractor import extract_document
from .config import settings

logger = logging.getLogger(__name__)


async def run_ingestion(
    user_id: str,
    material_id: str,
    source_type: str,
    url: str | None = None,
    file_path: str | None = None,
    text: str | None = None,
    topic_id: str | None = None,
    options: dict | None = None,
) -> dict:
    """
    Run the full ingestion pipeline.

    Steps:
    1. Extract content (URL / file / text)
    2. Deduplicate by content_hash
    3. Chunk the document
    4. Generate embeddings
    5. Write to Postgres (materials + chunks)

    Returns:
        { "status": "completed" | "duplicate" | "failed", "chunk_count": int, ... }
    """
    options = options or {}

    try:
        # ── Step 1: Extract content ──
        await db.update_job_status(material_id, "extracting",
            progress={"step": "extracting", "percent": 10, "detail": "Extracting content..."})

        extraction = await _extract(source_type, url, file_path, text)
        extracted_text = extraction["text"]
        title = extraction.get("title", "Untitled")
        content_hash = extraction.get("content_hash") or hashlib.sha256(
            extracted_text.encode("utf-8")
        ).hexdigest()
        metadata = extraction.get("metadata", {})
        docling_doc = extraction.get("docling_document")

        if not extracted_text.strip():
            raise ValueError("Extracted text is empty")

        # ── Step 2: Deduplicate ──
        existing = await db.check_duplicate(user_id, content_hash)
        if existing:
            await db.update_material_status(
                material_id, "completed",
                error="duplicate",
                content_hash=content_hash,
            )
            await db.update_job_status(material_id, "completed")
            return {
                "status": "duplicate",
                "existing_material_id": existing,
                "chunk_count": 0,
            }

        # ── Step 3: Chunk ──
        await db.update_job_status(material_id, "chunking",
            progress={"step": "chunking", "percent": 30, "detail": "Splitting document..."})

        chunks = chunk_document(
            text=extracted_text,
            docling_document=docling_doc,
            max_chunk_chars=options.get("max_chunk_chars", 2000),
            overlap_chars=options.get("overlap_chars", 200),
        )

        if not chunks:
            raise ValueError("No chunks generated")

        # ── Step 4: Embed ──
        await db.update_job_status(material_id, "embedding",
            progress={"step": "embedding", "percent": 60, "detail": f"Embedding {len(chunks)} chunks..."})

        chunk_texts = [c["content"] for c in chunks]
        embeddings = await embed_texts(chunk_texts)
        embedding_model = get_embedding_model_name()

        # Attach embeddings to chunks
        for i, chunk in enumerate(chunks):
            chunk["embedding"] = embeddings[i] if i < len(embeddings) else None
            chunk["embedding_model"] = embedding_model
            chunk["user_id"] = user_id
            chunk["material_id"] = material_id
            chunk["topic_id"] = topic_id

        # ── Step 5: Write to DB ──
        await db.update_job_status(material_id, "embedding",
            progress={"step": "writing", "percent": 85, "detail": "Saving to database..."})

        # Write chunks
        await db.insert_chunks(chunks)

        # Update material
        word_count = len(extracted_text.split())
        excerpt = extracted_text[:500] + ("..." if len(extracted_text) > 500 else "")

        await db.update_material_status(
            material_id,
            "completed",
            excerpt=excerpt,
            full_text=extracted_text,
            content_hash=content_hash,
            word_count=word_count,
            chunk_count=len(chunks),
            metadata=metadata,
            embedding_model=embedding_model,
        )

        # Mark job complete
        await db.update_job_status(material_id, "completed",
            progress={"step": "completed", "percent": 100, "detail": f"Done — {len(chunks)} chunks"})

        logger.info(f"Ingestion complete: material={material_id}, chunks={len(chunks)}")

        return {
            "status": "completed",
            "chunk_count": len(chunks),
            "word_count": word_count,
            "title": title,
        }

    except Exception as e:
        logger.exception(f"Ingestion failed: material={material_id}")
        await db.update_material_status(material_id, "failed", error=str(e))
        await db.update_job_status(material_id, "failed", error_message=str(e))
        return {
            "status": "failed",
            "error": str(e),
            "chunk_count": 0,
        }


async def _extract(
    source_type: str,
    url: str | None,
    file_path: str | None,
    text: str | None,
) -> dict:
    """Dispatch to the right extractor."""
    if source_type == "url":
        if not url:
            raise ValueError("url is required for source_type='url'")
        return await extract_url(url, engine=settings.url_engine)

    elif source_type == "file":
        if not file_path:
            raise ValueError("file_path is required for source_type='file'")
        return await extract_document(file_path)

    elif source_type == "text":
        if not text:
            raise ValueError("text is required for source_type='text'")
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return {
            "text": text,
            "title": text[:50].strip() + "..." if len(text) > 50 else text.strip(),
            "content_hash": content_hash,
            "metadata": {"extractor": "passthrough"},
            "docling_document": None,
        }

    else:
        raise ValueError(f"Unknown source_type: {source_type}")
