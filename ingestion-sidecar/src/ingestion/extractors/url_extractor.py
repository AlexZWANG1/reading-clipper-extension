"""URL content extraction using Jina Reader API (with fallback to httpx)."""

import hashlib
import logging

logger = logging.getLogger(__name__)


async def extract_url(url: str, engine: str = "jina") -> dict:
    """
    Extract text content from a URL.

    Returns:
        {
            "text": str,          # Extracted full text
            "title": str,         # Page title
            "content_hash": str,  # SHA-256 of text
            "metadata": dict,     # Extra metadata
        }
    """
    if engine == "jina":
        try:
            return await _extract_with_jina(url)
        except Exception as e:
            logger.warning(f"Jina Reader failed ({e}), falling back to httpx")
            return await _extract_with_httpx(url)
    else:
        return await _extract_with_httpx(url)


async def _extract_with_jina(url: str) -> dict:
    """Use Jina Reader API (free, no auth required)."""
    import httpx

    jina_url = f"https://r.jina.ai/{url}"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(jina_url, headers={"Accept": "text/plain"})
        resp.raise_for_status()
        text = resp.text

    # Jina returns markdown-formatted text, extract title from first line if it's a heading
    lines = text.split("\n", 2)
    title = ""
    if lines and lines[0].startswith("# "):
        title = lines[0][2:].strip()
        text = "\n".join(lines[1:]) if len(lines) > 1 else text

    if not title:
        title = _title_from_url(url)

    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

    return {
        "text": text,
        "title": title,
        "content_hash": content_hash,
        "metadata": {
            "source_url": url,
            "extractor": "jina-reader",
        },
    }


async def _extract_with_httpx(url: str) -> dict:
    """Fallback: fetch HTML and strip tags."""
    import httpx
    import re

    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text

    # Extract title
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else _title_from_url(url)

    # Strip HTML tags (basic)
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

    return {
        "text": text,
        "title": title,
        "content_hash": content_hash,
        "metadata": {
            "source_url": url,
            "extractor": "httpx-fallback",
        },
    }


def _title_from_url(url: str) -> str:
    """Generate a simple title from URL."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return parsed.netloc + parsed.path.rstrip("/").split("/")[-1][:50]
