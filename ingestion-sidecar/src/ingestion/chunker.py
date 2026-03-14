"""Document chunking with Docling HierarchicalChunker and fallback."""

import json
import logging

logger = logging.getLogger(__name__)


def chunk_document(
    text: str,
    docling_document=None,
    max_chunk_chars: int = 2000,
    overlap_chars: int = 200,
) -> list[dict]:
    """
    Split document into chunks.

    If docling_document is provided, uses HierarchicalChunker for structure-aware chunking.
    Otherwise, falls back to simple text splitting.

    Returns list of:
        {
            "content": str,
            "chunk_index": int,
            "heading_trail": list[str],
            "locator": dict,       # { page, bbox, ... }
            "quote": str,          # First 100 chars preview
            "token_count": int,    # Approximate
        }
    """
    if docling_document is not None:
        try:
            return _chunk_with_docling(docling_document)
        except Exception as e:
            logger.warning(f"Docling chunking failed ({e}), falling back to simple")

    return _chunk_simple(text, max_chunk_chars, overlap_chars)


def _chunk_with_docling(doc) -> list[dict]:
    """Use Docling HierarchicalChunker for structure-aware chunks."""
    from docling.chunking import HierarchicalChunker

    # Ollama nomic-embed-text effective limit is ~6400 chars (~1500 tokens)
    # Keep chunks well under this limit
    chunker = HierarchicalChunker(max_tokens=1000)
    doc_chunks = list(chunker.chunk(doc))

    results = []
    for idx, chunk in enumerate(doc_chunks):
        chunk_text = chunk.text

        # Build locator from Docling metadata
        locator = {}
        headings = []

        if hasattr(chunk, "meta"):
            if hasattr(chunk.meta, "headings") and chunk.meta.headings:
                headings = list(chunk.meta.headings)

            if hasattr(chunk.meta, "doc_items") and chunk.meta.doc_items:
                first_item = chunk.meta.doc_items[0]
                if hasattr(first_item, "prov") and first_item.prov:
                    prov = first_item.prov[0]
                    if hasattr(prov, "page_no"):
                        locator["page"] = prov.page_no
                    if hasattr(prov, "bbox") and prov.bbox:
                        locator["bbox"] = {
                            "l": int(prov.bbox.l),
                            "t": int(prov.bbox.t),
                            "r": int(prov.bbox.r),
                            "b": int(prov.bbox.b),
                        }

                # Get page_end from last item
                if len(chunk.meta.doc_items) > 1:
                    last_item = chunk.meta.doc_items[-1]
                    if hasattr(last_item, "prov") and last_item.prov:
                        last_page = last_item.prov[0].page_no
                        if last_page != locator.get("page"):
                            locator["page_end"] = last_page

        # Approximate token count (rough: 1 token ~ 4 chars for English, ~2 for Chinese)
        token_count = max(len(chunk_text) // 3, 1)

        results.append({
            "content": chunk_text,
            "chunk_index": idx,
            "heading_trail": headings,
            "locator": json.dumps(locator),
            "quote": chunk_text[:100] + ("..." if len(chunk_text) > 100 else ""),
            "token_count": token_count,
        })

    logger.info(f"Docling chunking: {len(results)} chunks")
    return results


def _chunk_simple(
    text: str,
    max_chunk_chars: int = 2000,
    overlap_chars: int = 200,
) -> list[dict]:
    """Fallback: split text by paragraphs with overlap."""
    if not text.strip():
        return []

    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""
    current_start = 0  # char offset in original text

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # CRITICAL FIX: Force-split oversized single paragraphs
        # This prevents "entire article becomes one chunk" bug when URL extraction
        # produces poorly-structured text without proper \n\n separators
        if len(para) > max_chunk_chars:
            # Emit current chunk first if exists
            if current_chunk:
                chunks.append(_build_simple_chunk(current_chunk, len(chunks), current_start))
                current_start += len(current_chunk)
                current_chunk = ""

            # Split oversized paragraph into smaller chunks
            para_offset = 0
            while para_offset < len(para):
                chunk_text = para[para_offset:para_offset + max_chunk_chars]
                chunks.append(_build_simple_chunk(chunk_text, len(chunks), current_start + para_offset))
                para_offset += max_chunk_chars - overlap_chars

            current_start += len(para)
            continue

        if len(current_chunk) + len(para) + 2 > max_chunk_chars and current_chunk:
            # Emit current chunk
            chunks.append(_build_simple_chunk(current_chunk, len(chunks), current_start))
            # Start new chunk with overlap
            overlap_text = current_chunk[-overlap_chars:] if len(current_chunk) > overlap_chars else ""
            current_start = current_start + len(current_chunk) - len(overlap_text)
            current_chunk = overlap_text

        if current_chunk:
            current_chunk += "\n\n" + para
        else:
            current_chunk = para

    # Last chunk
    if current_chunk.strip():
        chunks.append(_build_simple_chunk(current_chunk, len(chunks), current_start))

    logger.info(f"Simple chunking: {len(chunks)} chunks")
    return chunks


def _build_simple_chunk(text: str, index: int, char_start: int) -> dict:
    return {
        "content": text,
        "chunk_index": index,
        "heading_trail": [],
        "locator": json.dumps({"char_start": char_start, "char_end": char_start + len(text)}),
        "quote": text[:100] + ("..." if len(text) > 100 else ""),
        "token_count": max(len(text) // 3, 1),
    }
