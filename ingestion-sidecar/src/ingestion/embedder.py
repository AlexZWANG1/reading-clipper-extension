"""Embedding generation with Esperanto (multi-provider) and OpenAI fallback."""

import logging
from typing import Sequence

from .config import settings

logger = logging.getLogger(__name__)

# Real OpenAI API endpoint
_OPENAI_DIRECT_URL = "https://api.openai.com/v1/embeddings"


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a list of texts.

    Tries Esperanto first, falls back to direct OpenAI API call.
    If proxy returns 404, automatically retries with real OpenAI endpoint.
    """
    if not texts:
        return []

    try:
        return await _embed_with_esperanto(texts)
    except ImportError:
        logger.warning("esperanto not installed, falling back to OpenAI direct")
        return await _embed_with_openai(texts)
    except Exception as e:
        logger.warning(f"esperanto failed ({e}), falling back to OpenAI direct")
        return await _embed_with_openai(texts)


async def _embed_with_esperanto(texts: list[str]) -> list[list[float]]:
    """Use Esperanto's multi-provider abstraction."""
    from esperanto import AIFactory

    embedder = AIFactory.create_embedding(
        provider=settings.embedding_provider,
        model_name=settings.embedding_model,
    )

    response = await embedder.aembed(texts)
    return [d.embedding for d in response.data]


async def _embed_with_openai(texts: list[str]) -> list[list[float]]:
    """Fallback: direct OpenAI embeddings API via httpx.

    Tries proxy URL first. If proxy returns 404, retries with real OpenAI API.
    """
    import httpx

    proxy_key = settings.openai_api_key
    real_key = settings.openai_real_api_key
    if not proxy_key and not real_key:
        raise ValueError("No OpenAI API key configured for embeddings")

    base_url = settings.openai_base_url.rstrip("/") if settings.openai_base_url else ""
    proxy_url = f"{base_url}/embeddings" if base_url else None

    # Try proxy first, then fall back to real OpenAI
    attempts = []
    if proxy_url and proxy_key:
        attempts.append((proxy_url, proxy_key, "proxy"))
    if real_key:
        attempts.append((_OPENAI_DIRECT_URL, real_key, "direct"))
    elif proxy_key and not proxy_url:
        attempts.append((_OPENAI_DIRECT_URL, proxy_key, "direct"))

    if not attempts:
        raise ValueError("No embedding endpoint configured")

    last_error = None
    for url, key, label in attempts:
        try:
            result = await _call_embeddings_api(texts, url, key)
            logger.info(f"Embedding via {label} ({url}) succeeded")
            return result
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404 and label == "proxy":
                logger.warning(f"Proxy 404 on embeddings, trying direct OpenAI API...")
                last_error = e
                continue
            raise
        except Exception as e:
            if label == "proxy":
                logger.warning(f"Proxy embedding failed ({e}), trying direct...")
                last_error = e
                continue
            raise

    raise last_error or ValueError("All embedding attempts failed")


async def _call_embeddings_api(texts: list[str], url: str, api_key: str) -> list[list[float]]:
    """Call OpenAI-compatible embeddings endpoint with retry on 429."""
    import asyncio
    import httpx

    all_embeddings: list[list[float]] = [[] for _ in texts]
    batch_size = 100
    max_retries = 3

    async with httpx.AsyncClient(timeout=60) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]

            for attempt in range(max_retries):
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.embedding_model,
                        "input": batch,
                    },
                )
                if resp.status_code == 429:
                    wait = min(2 ** attempt * 2, 10)
                    logger.warning(f"Rate limited (429), retrying in {wait}s (attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                data = resp.json()
                for item in data["data"]:
                    all_embeddings[i + item["index"]] = item["embedding"]
                break
            else:
                resp.raise_for_status()  # raise the last 429

    return all_embeddings


def get_embedding_model_name() -> str:
    """Return the current embedding model identifier."""
    return f"{settings.embedding_provider}/{settings.embedding_model}"
