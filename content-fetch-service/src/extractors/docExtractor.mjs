/**
 * Document extraction (PDF/DOCX) - placeholder for future implementation
 */
export async function extractDocument(filePath, mimeType) {
  // TODO: Implement PDF/DOCX extraction
  // Can use pdf-parse, mammoth, or docling
  return {
    article_html: null,
    text_content: 'Document extraction not yet implemented',
    title: filePath,
    byline: null,
    site_name: null,
    excerpt: null,
    lead_image_url: null,
    published_time: null,
    extraction_method: 'not_implemented',
    extraction_status: 'failed',
    extraction_error: 'Document extraction not yet implemented',
  };
}
