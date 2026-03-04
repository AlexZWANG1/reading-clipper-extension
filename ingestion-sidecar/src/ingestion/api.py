"""FastAPI application — the sidecar's HTTP interface."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

from .config import settings
from .db import get_client, close_client
from .pipeline import run_ingestion
from .embedder import embed_texts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown: manage HTTP client."""
    logger.info(f"Sidecar starting on {settings.host}:{settings.port}")
    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set!")
    else:
        await get_client()
        logger.info("Supabase REST client ready")
    yield
    await close_client()
    logger.info("Sidecar stopped")


app = FastAPI(
    title="Reading Clipper Ingestion Sidecar",
    version="0.1.0",
    lifespan=lifespan,
)


# ── Auth middleware ──

def _verify_key(x_sidecar_key: str | None = Header(None)):
    """Verify internal API key if configured."""
    if settings.sidecar_api_key and x_sidecar_key != settings.sidecar_api_key:
        raise HTTPException(status_code=401, detail="Invalid sidecar key")


# ── Request/Response models ──

class IngestRequest(BaseModel):
    user_id: str
    material_id: str
    source_type: str  # url | file | text
    url: str | None = None
    file_path: str | None = None
    text: str | None = None
    topic_id: str | None = None
    options: dict | None = None


class IngestResponse(BaseModel):
    status: str
    chunk_count: int = 0
    word_count: int | None = None
    title: str | None = None
    error: str | None = None
    existing_material_id: str | None = None


class EmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str


# ── Endpoints ──

@app.get("/health")
async def health():
    return {"ok": True, "version": "0.1.0"}


@app.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest, x_sidecar_key: str | None = Header(None)):
    """Run the full ingestion pipeline (extract → chunk → embed → store)."""
    _verify_key(x_sidecar_key)

    result = await run_ingestion(
        user_id=req.user_id,
        material_id=req.material_id,
        source_type=req.source_type,
        url=req.url,
        file_path=req.file_path,
        text=req.text,
        topic_id=req.topic_id,
        options=req.options,
    )

    return IngestResponse(**result)


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest, x_sidecar_key: str | None = Header(None)):
    """Generate embeddings for a list of texts (used by Node.js backend)."""
    _verify_key(x_sidecar_key)

    if not req.texts:
        return EmbedResponse(embeddings=[], model=settings.embedding_model)

    if len(req.texts) > 500:
        raise HTTPException(status_code=400, detail="Max 500 texts per request")

    try:
        embeddings = await embed_texts(req.texts)
    except Exception as e:
        err_msg = str(e)
        if "insufficient_quota" in err_msg or "429" in err_msg:
            raise HTTPException(status_code=502, detail=f"Embedding API quota exceeded: {err_msg}")
        raise HTTPException(status_code=502, detail=f"Embedding failed: {err_msg}")

    return EmbedResponse(
        embeddings=embeddings,
        model=f"{settings.embedding_provider}/{settings.embedding_model}",
    )
