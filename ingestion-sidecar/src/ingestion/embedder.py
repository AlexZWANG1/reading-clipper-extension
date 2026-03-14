"""Local embeddings via Ollama (OpenAI-compatible API)."""

import logging
import httpx

from .config import settings

logger = logging.getLogger(__name__)


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a list of texts using local Ollama.

    Uses OpenAI-compatible /v1/embeddings endpoint.
    No fallback to external APIs - fails fast with clear error messages.
    """
    if not texts:
        return []

    base_url = settings.embeddings_base_url.rstrip("/")
    endpoint = f"{base_url}/embeddings"
    api_key = settings.embeddings_api_key or "ollama"
    model = settings.embeddings_model

    # nomic-embed-text via Ollama has effective limit of ~6400 chars
    # Truncate any text that exceeds this to prevent 400 errors
    max_chars = 6000  # conservative limit
    truncated_texts = [t[:max_chars] if len(t) > max_chars else t for t in texts]

    logger.info(f"Embedding {len(truncated_texts)} texts via {endpoint} (model: {model})")

    try:
        embeddings = await _call_embeddings_api(truncated_texts, endpoint, api_key, model)
        logger.info(f"Successfully embedded {len(texts)} texts")
        return embeddings
    except httpx.HTTPStatusError as e:
        error_body = e.response.text[:500] if e.response.text else "(no body)"
        raise RuntimeError(
            f"Embeddings API returned {e.response.status_code}: {error_body}. "
            f"Endpoint: {endpoint}, Model: {model}. "
            f"Make sure Ollama is running and the model is pulled."
        ) from e
    except httpx.RequestError as e:
        raise RuntimeError(
            f"Failed to connect to embeddings endpoint {endpoint}: {e}. "
            f"Make sure Ollama is running at {base_url}."
        ) from e
    except Exception as e:
        raise RuntimeError(
            f"Unexpected error during embedding: {e}. "
            f"Endpoint: {endpoint}, Model: {model}"
        ) from e


async def _call_embeddings_api(
    texts: list[str], url: str, api_key: str, model: str
) -> list[list[float]]:
    """Call OpenAI-compatible embeddings endpoint.

    Sends texts one at a time to avoid Ollama batch context length limits.
    """
    all_embeddings: list[list[float]] = []

    async with httpx.AsyncClient(timeout=120) as client:
        for idx, text in enumerate(texts):
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "input": text,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            # Parse OpenAI-compatible response format
            if "data" not in data:
                raise ValueError(
                    f"Invalid response format (missing 'data' field): {str(data)[:200]}"
                )

            for item in data["data"]:
                if "embedding" not in item:
                    raise ValueError(
                        f"Invalid response format (missing 'embedding' field): {str(item)[:200]}"
                    )
                all_embeddings.append(item["embedding"])

            if (idx + 1) % 20 == 0:
                logger.info(f"Embedded {idx + 1}/{len(texts)} texts...")

    return all_embeddings


def get_embedding_model_name() -> str:
    """Return the current embedding model identifier."""
    return f"ollama/{settings.embeddings_model}"
