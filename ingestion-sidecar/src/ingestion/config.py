"""Sidecar configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase REST API (used instead of direct Postgres connection)
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Embedding configuration (local Ollama by default)
    embeddings_base_url: str = "http://127.0.0.1:11434/v1"
    embeddings_model: str = "nomic-embed-text"
    embeddings_api_key: str = "ollama"  # dummy key for Ollama compatibility
    embeddings_dimensions: int = 768  # nomic-embed-text dimension

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
