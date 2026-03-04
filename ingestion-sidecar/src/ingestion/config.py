"""Sidecar configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase REST API (used instead of direct Postgres connection)
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Embedding provider
    embedding_provider: str = "openai"  # openai / ollama / voyage / google
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # OpenAI (for embedding when provider=openai)
    openai_api_key: str = ""
    openai_base_url: str = ""  # proxy endpoint if needed
    openai_real_api_key: str = ""  # real key, used when proxy doesn't support embeddings

    # Content extraction
    url_engine: str = "jina"  # jina / beautifulsoup / firecrawl
    doc_engine: str = "docling"  # docling / pymupdf

    # Sidecar internal auth
    sidecar_api_key: str = ""

    # Server
    host: str = "127.0.0.1"
    port: int = 8100

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
