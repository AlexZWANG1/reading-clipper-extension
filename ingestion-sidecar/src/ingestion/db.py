"""Database access via Supabase REST API (PostgREST) over HTTPS.

Uses httpx instead of asyncpg to avoid Postgres direct-connect SSL issues
on Windows with VPN/proxy setups.
"""

import json
import logging

import httpx

from .config import settings

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def _headers() -> dict:
    """Build Supabase service-role headers."""
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _rest_url(table: str) -> str:
    return f"{settings.supabase_url}/rest/v1/{table}"


def _rpc_url(fn_name: str) -> str:
    return f"{settings.supabase_url}/rest/v1/rpc/{fn_name}"


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=60)
    return _client


async def close_client():
    global _client
    if _client:
        await _client.aclose()
        _client = None


# ── Material operations ──────────────────────────


async def update_material_status(
    material_id: str,
    status: str,
    *,
    error: str | None = None,
    excerpt: str | None = None,
    full_text: str | None = None,
    content_hash: str | None = None,
    word_count: int | None = None,
    chunk_count: int | None = None,
    metadata: dict | None = None,
    embedding_model: str | None = None,
):
    """Update material after ingestion steps."""
    client = await get_client()

    body: dict = {"ingestion_status": status}

    for key, val in [
        ("ingestion_error", error),
        ("excerpt", excerpt),
        ("full_text", full_text),
        ("content_hash", content_hash),
        ("word_count", word_count),
        ("chunk_count", chunk_count),
        ("metadata", metadata),
        ("embedding_model", embedding_model),
    ]:
        if val is not None:
            body[key] = val

    resp = await client.patch(
        f"{_rest_url('materials')}?id=eq.{material_id}",
        headers=_headers(),
        json=body,
    )
    if resp.status_code >= 400:
        logger.error(f"update_material_status failed: {resp.status_code} {resp.text}")

        # If content_hash conflict (409), retry without content_hash
        if resp.status_code == 409 and "content_hash" in body:
            logger.warning(f"Retrying update without content_hash (already exists)")
            body_without_hash = {k: v for k, v in body.items() if k != "content_hash"}
            resp = await client.patch(
                f"{_rest_url('materials')}?id=eq.{material_id}",
                headers=_headers(),
                json=body_without_hash,
            )
            if resp.status_code >= 400:
                logger.error(f"Retry also failed: {resp.status_code} {resp.text}")
            else:
                logger.info(f"Update succeeded without content_hash")


async def check_duplicate(user_id: str, content_hash: str) -> str | None:
    """Check if a material with same content_hash exists for this user."""
    client = await get_client()

    resp = await client.get(
        f"{_rest_url('materials')}?user_id=eq.{user_id}&content_hash=eq.{content_hash}&select=id&limit=1",
        headers=_headers(),
    )
    if resp.status_code == 200:
        data = resp.json()
        if data:
            return data[0]["id"]
    return None


async def insert_chunks(chunks: list[dict]):
    """Batch insert chunks into the chunks table."""
    if not chunks:
        return

    client = await get_client()

    # PostgREST accepts JSON array for batch insert
    rows = []
    for c in chunks:
        row = {
            "user_id": c["user_id"],
            "material_id": c["material_id"],
            "topic_id": c.get("topic_id"),
            "content": c["content"],
            "chunk_index": c["chunk_index"],
            "heading_trail": c.get("heading_trail", []),
            "locator": c.get("locator", "{}") if isinstance(c.get("locator"), str) else json.dumps(c.get("locator", {})),
            "quote": c.get("quote"),
            "embedding_model": c.get("embedding_model"),
            "token_count": c.get("token_count"),
            "metadata": c.get("metadata", "{}") if isinstance(c.get("metadata"), str) else json.dumps(c.get("metadata", {})),
        }

        # Embedding: convert list[float] to pgvector string format "[0.1,0.2,...]"
        emb = c.get("embedding")
        if emb is not None and isinstance(emb, list):
            row["embedding"] = f"[{','.join(str(x) for x in emb)}]"
        else:
            row["embedding"] = None

        rows.append(row)

    # Insert in batches of 50 to avoid payload size limits
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        resp = await client.post(
            _rest_url("chunks"),
            headers=_headers(),
            json=batch,
        )
        if resp.status_code >= 400:
            logger.error(f"insert_chunks batch {i} failed: {resp.status_code} {resp.text[:500]}")
            raise RuntimeError(f"insert_chunks failed: {resp.status_code} {resp.text[:200]}")

    logger.info(f"Inserted {len(rows)} chunks")


async def update_job_status(
    material_id: str,
    status: str,
    *,
    error_message: str | None = None,
    progress: dict | None = None,
):
    """Update the latest ingestion job for a material."""
    client = await get_client()

    # First, find the latest job for this material
    resp = await client.get(
        f"{_rest_url('ingestion_jobs')}?material_id=eq.{material_id}&order=created_at.desc&limit=1&select=id",
        headers=_headers(),
    )
    if resp.status_code != 200 or not resp.json():
        logger.warning(f"No ingestion job found for material {material_id}")
        return

    job_id = resp.json()[0]["id"]

    body: dict = {"status": status}
    if error_message:
        body["error_message"] = error_message
    if progress:
        body["progress"] = progress
    if status == "completed":
        # PostgREST doesn't support NOW() in PATCH body,
        # so we pass the current timestamp
        from datetime import datetime, timezone
        body["completed_at"] = datetime.now(timezone.utc).isoformat()

    resp = await client.patch(
        f"{_rest_url('ingestion_jobs')}?id=eq.{job_id}",
        headers=_headers(),
        json=body,
    )
    if resp.status_code >= 400:
        logger.error(f"update_job_status failed: {resp.status_code} {resp.text}")
