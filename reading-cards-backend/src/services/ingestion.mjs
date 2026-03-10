// ========= Shared Ingestion Service =========
// Extracted from routes/v2/materials.mjs for reuse by task runner.

const SIDECAR_URL = process.env.SIDECAR_URL || 'http://127.0.0.1:8100';
const SIDECAR_API_KEY = process.env.SIDECAR_API_KEY || 'rc-sidecar-2026';
const CONTENT_FETCH_URL = process.env.CONTENT_FETCH_URL || 'http://127.0.0.1:8200';

/**
 * Ingest a URL: extract content → create material → trigger sidecar chunking.
 * @param {Object} supabase - Supabase admin client (service-role)
 * @param {string} userId
 * @param {Object} opts - { url, title?, topic_id? }
 * @returns {Object} { material_id, status }
 */
export async function ingestUrl(supabase, userId, opts) {
  const { url, title, topic_id } = opts;

  // 1. Call content-fetch service
  let extractionResult = null;
  try {
    const response = await fetch(`${CONTENT_FETCH_URL}/extract/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        options: { saveRawHtml: false, usePuppeteer: 'auto', timeout: 15000 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      extractionResult = await response.json();
    }
  } catch (err) {
    console.warn('[ingestion] content-fetch failed:', err.message);
  }

  // 2. Create material record
  const materialData = {
    user_id: userId,
    title: extractionResult?.title || title || url,
    source_type: 'url',
    url,
    topic_id: topic_id || null,
    ingestion_status: 'pending',
  };

  if (extractionResult) {
    materialData.article_html = extractionResult.article_html;
    materialData.text_content = extractionResult.text_content;
    materialData.full_text = extractionResult.text_content;
    materialData.byline = extractionResult.byline;
    materialData.site_name = extractionResult.site_name;
    materialData.published_time = extractionResult.published_time;
    materialData.lead_image_url = extractionResult.lead_image_url;
    materialData.excerpt = extractionResult.excerpt;
    materialData.extraction_method = extractionResult.extraction_method;
    materialData.extraction_status = extractionResult.extraction_status;
    materialData.extraction_error = extractionResult.extraction_error;
  }

  const { data: material, error: materialError } = await supabase
    .from('materials')
    .insert(materialData)
    .select()
    .single();

  if (materialError) {
    throw new Error(`Failed to create material: ${materialError.message}`);
  }

  // 3. Trigger sidecar (fire-and-forget)
  const sidecarPayload = {
    user_id: userId,
    material_id: material.id,
    source_type: 'url',
    url,
    text: extractionResult?.text_content || null,
    topic_id: topic_id || null,
  };

  fetch(`${SIDECAR_URL}/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sidecar-Key': SIDECAR_API_KEY,
    },
    body: JSON.stringify(sidecarPayload),
  }).catch((err) => {
    console.error('[ingestion] sidecar failed:', err.message);
    supabase
      .from('materials')
      .update({ ingestion_status: 'failed', ingestion_error: err.message })
      .eq('id', material.id)
      .then();
  });

  return { material_id: material.id, status: 'pending', title: material.title };
}

/**
 * Ingest plain text content.
 */
export async function ingestText(supabase, userId, opts) {
  const { text, title, topic_id } = opts;

  const { data: material, error } = await supabase
    .from('materials')
    .insert({
      user_id: userId,
      title: title || 'Untitled',
      source_type: 'text',
      topic_id: topic_id || null,
      text_content: text,
      full_text: text,
      ingestion_status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create material: ${error.message}`);

  fetch(`${SIDECAR_URL}/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sidecar-Key': SIDECAR_API_KEY,
    },
    body: JSON.stringify({
      user_id: userId,
      material_id: material.id,
      source_type: 'text',
      text,
      topic_id: topic_id || null,
    }),
  }).catch((err) => {
    console.error('[ingestion] sidecar failed:', err.message);
    supabase
      .from('materials')
      .update({ ingestion_status: 'failed', ingestion_error: err.message })
      .eq('id', material.id)
      .then();
  });

  return { material_id: material.id, status: 'pending', title: material.title };
}
