-- ============================================
-- URL Extraction Upgrade Migration
-- Add rich metadata fields for article reading experience
-- ============================================

-- Add new fields to materials table
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS raw_html TEXT,
  ADD COLUMN IF NOT EXISTS article_html TEXT,
  ADD COLUMN IF NOT EXISTS text_content TEXT,
  ADD COLUMN IF NOT EXISTS byline TEXT,
  ADD COLUMN IF NOT EXISTS site_name TEXT,
  ADD COLUMN IF NOT EXISTS published_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_local_url TEXT,
  ADD COLUMN IF NOT EXISTS extraction_method TEXT,
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'success', 'partial', 'failed')),
  ADD COLUMN IF NOT EXISTS extraction_error TEXT;

-- Create index for extraction status
CREATE INDEX IF NOT EXISTS idx_materials_extraction_status
  ON materials(extraction_status);

-- Migrate existing data: full_text → text_content
UPDATE materials
SET text_content = full_text
WHERE text_content IS NULL AND full_text IS NOT NULL;

-- Add comments for clarity
COMMENT ON COLUMN materials.full_text IS 'DEPRECATED: use text_content instead (kept for backward compatibility)';
COMMENT ON COLUMN materials.text_content IS 'Plain text for chunking/embedding';
COMMENT ON COLUMN materials.article_html IS 'Cleaned HTML for reader display';
COMMENT ON COLUMN materials.raw_html IS 'Original HTML (optional, for debugging)';
COMMENT ON COLUMN materials.byline IS 'Article author/byline';
COMMENT ON COLUMN materials.site_name IS 'Source website name';
COMMENT ON COLUMN materials.published_time IS 'Article publication date';
COMMENT ON COLUMN materials.lead_image_url IS 'Main article image URL';
COMMENT ON COLUMN materials.extraction_method IS 'Extraction method used (readability/postlight/basic/puppeteer)';
COMMENT ON COLUMN materials.extraction_status IS 'Extraction quality status';
