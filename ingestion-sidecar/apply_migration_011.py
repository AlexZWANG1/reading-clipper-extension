"""Apply migration 011 via Python."""
import httpx
import asyncio

SUPABASE_URL = "https://eqvlgoiiumstaqywtpon.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdmxnb2lpdW1zdGFxeXd0cG9uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY1MzAwNiwiZXhwIjoyMDgyMjI5MDA2fQ.yZCyCZeH1NypjZlsJfFPn9sekdybQd5phYuE0-VB4sU"

SQL_STATEMENTS = [
    "DROP INDEX IF EXISTS idx_chunks_embedding",
    "ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768)",
    "ALTER TABLE chunks ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text'",
    "CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)",
]

async def main():
    async with httpx.AsyncClient() as client:
        for i, sql in enumerate(SQL_STATEMENTS, 1):
            print(f"{i}. Executing: {sql[:60]}...")
            # Use PostgREST's query parameter to execute raw SQL
            # Note: This requires the SQL to be a valid SELECT/INSERT/UPDATE/DELETE
            # For DDL, we need to use a different approach
            print(f"   ⚠️  Cannot execute DDL via REST API")
            print(f"   Please run this SQL manually in Supabase SQL Editor:")
            print(f"   {sql}")
            print()

if __name__ == "__main__":
    asyncio.run(main())
