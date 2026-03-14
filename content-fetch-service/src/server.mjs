import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { extractUrl, extractFromHtml } from './extractors/urlExtractor.mjs';
import { extractDocument } from './extractors/docExtractor.mjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8200;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'content-fetch',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Extract URL content
app.post('/extract/url', async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    console.log(`[Content Fetch] Extracting URL: ${url}`);
    const startTime = Date.now();

    const result = await extractUrl(url, options);

    const duration = Date.now() - startTime;
    console.log(`[Content Fetch] Completed in ${duration}ms - Method: ${result.extraction_method}, Status: ${result.extraction_status}`);

    res.json(result);
  } catch (error) {
    console.error('[Content Fetch] URL extraction failed:', error);
    res.status(500).json({
      error: error.message,
      extraction_status: 'failed'
    });
  }
});

// Extract document (PDF/DOCX)
app.post('/extract/document', async (req, res) => {
  try {
    const { file_path, mime_type } = req.body;

    if (!file_path) {
      return res.status(400).json({ error: 'file_path is required' });
    }

    console.log(`[Content Fetch] Extracting document: ${file_path}`);
    const result = await extractDocument(file_path, mime_type);

    res.json(result);
  } catch (error) {
    console.error('[Content Fetch] Document extraction failed:', error);
    res.status(500).json({
      error: error.message,
      extraction_status: 'failed'
    });
  }
});

// Extract from raw HTML (for browser extension — page already rendered)
app.post('/extract/html', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({ error: 'html is required' });
    }

    console.log(`[Content Fetch] Extracting from raw HTML (${html.length} chars), url: ${url || 'none'}`);
    const startTime = Date.now();

    const result = await extractFromHtml(html, url || 'about:blank');

    const duration = Date.now() - startTime;
    console.log(`[Content Fetch] HTML extraction completed in ${duration}ms - Status: ${result.extraction_status}`);

    res.json(result);
  } catch (error) {
    console.error('[Content Fetch] HTML extraction failed:', error);
    res.status(500).json({
      error: error.message,
      extraction_status: 'failed'
    });
  }
});

// Batch extraction endpoint
app.post('/extract/batch', async (req, res) => {
  try {
    const { urls = [] } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls array is required' });
    }

    if (urls.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 URLs per batch' });
    }

    console.log(`[Content Fetch] Batch extraction: ${urls.length} URLs`);

    const results = await Promise.allSettled(
      urls.map(url => extractUrl(url, { timeout: 20000 }))
    );

    const response = results.map((result, index) => ({
      url: urls[index],
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null,
    }));

    res.json({ results: response });
  } catch (error) {
    console.error('[Content Fetch] Batch extraction failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Content Fetch Service running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});
