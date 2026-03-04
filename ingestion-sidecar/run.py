"""Entry point for the ingestion sidecar."""

import uvicorn
from src.ingestion.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "src.ingestion.api:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
