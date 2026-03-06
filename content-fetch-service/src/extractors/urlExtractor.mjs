import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import DOMPurify from 'isomorphic-dompurify';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import metascraper from 'metascraper';
import metascraperAuthor from 'metascraper-author';
import metascraperDate from 'metascraper-date';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';

puppeteer.use(StealthPlugin());

const scraper = metascraper([
  metascraperAuthor(),
  metascraperDate(),
  metascraperDescription(),
  metascraperImage(),
  metascraperTitle(),
  metascraperUrl(),
]);

/**
 * Extract article content from URL
 * Strategy: Fetch HTML → Readability → Metadata → Fallback
 */
export async function extractUrl(url, options = {}) {
  const {
    useHeadless = process.env.PUPPETEER_HEADLESS !== 'false',
    timeout = parseInt(process.env.PUPPETEER_TIMEOUT) || 30000,
    waitForSelector = null,
    saveRawHtml = false,
    usePuppeteer = 'auto', // 'auto' | 'always' | 'never'
  } = options;

  let rawHtml = null;
  let extractionMethod = null;
  let extractionStatus = 'pending';
  let extractionError = null;
  let fetchMethod = null;

  try {
    // Step 1: Fetch HTML
    const fetchResult = await fetchHtml(url, {
      useHeadless,
      timeout,
      waitForSelector,
      usePuppeteer,
    });
    rawHtml = fetchResult.html;
    fetchMethod = fetchResult.method;

    // Step 2: Extract metadata (Open Graph, Twitter Cards, etc.)
    const metadata = await scraper({ html: rawHtml, url });

    // Step 3: Try Readability (primary)
    try {
      const article = await extractWithReadability(url, rawHtml);
      extractionMethod = fetchMethod === 'puppeteer' ? 'puppeteer+readability' : 'readability';
      extractionStatus = 'success';

      return {
        ...article,
        ...mergeMetadata(article, metadata),
        extraction_method: extractionMethod,
        extraction_status: extractionStatus,
        extraction_error: null,
        raw_html: saveRawHtml ? rawHtml : null,
      };
    } catch (readabilityError) {
      console.warn(`Readability failed for ${url}:`, readabilityError.message);
      extractionError = `Readability: ${readabilityError.message}`;
    }

    // Step 4: Fallback to basic extraction
    const article = extractBasic(rawHtml, url, metadata);
    extractionMethod = 'basic';
    extractionStatus = 'partial';

    return {
      ...article,
      extraction_method: extractionMethod,
      extraction_status: extractionStatus,
      extraction_error: extractionError,
      raw_html: saveRawHtml ? rawHtml : null,
    };

  } catch (error) {
    console.error(`URL extraction failed for ${url}:`, error);
    return {
      article_html: null,
      text_content: null,
      title: url,
      byline: null,
      site_name: new URL(url).hostname,
      excerpt: null,
      lead_image_url: null,
      published_time: null,
      extraction_method: null,
      extraction_status: 'failed',
      extraction_error: error.message,
      raw_html: null,
    };
  }
}

/**
 * Fetch HTML with smart strategy
 */
async function fetchHtml(url, options) {
  const { useHeadless, timeout, waitForSelector, usePuppeteer } = options;

  // Force Puppeteer if requested
  if (usePuppeteer === 'always') {
    return await fetchWithPuppeteer(url, { useHeadless, timeout, waitForSelector });
  }

  // Try simple fetch first
  if (usePuppeteer !== 'always') {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Check if page needs JS rendering
      if (usePuppeteer === 'auto' && needsJsRendering(html)) {
        console.log(`[Fetch] Page needs JS rendering, switching to Puppeteer`);
        return await fetchWithPuppeteer(url, { useHeadless, timeout, waitForSelector });
      }

      return { html, method: 'fetch' };
    } catch (fetchError) {
      console.warn(`[Fetch] Simple fetch failed: ${fetchError.message}, trying Puppeteer`);
      if (usePuppeteer !== 'never') {
        return await fetchWithPuppeteer(url, { useHeadless, timeout, waitForSelector });
      }
      throw fetchError;
    }
  }
}

/**
 * Fetch with Puppeteer (for JS-heavy pages)
 */
async function fetchWithPuppeteer(url, options) {
  const { useHeadless, timeout, waitForSelector } = options;

  const browser = await puppeteer.launch({
    headless: useHeadless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['font', 'media', 'websocket'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {
        console.warn(`[Puppeteer] Selector not found: ${waitForSelector}`);
      });
    }

    // Wait a bit for lazy-loaded images
    await page.evaluate(() => {
      return new Promise((resolve) => setTimeout(resolve, 1000));
    });

    const html = await page.content();
    return { html, method: 'puppeteer' };
  } finally {
    await browser.close();
  }
}

/**
 * Check if page needs JS rendering
 */
function needsJsRendering(html) {
  const indicators = [
    /<div[^>]*id=["']root["']/i,
    /<div[^>]*id=["']app["']/i,
    /<div[^>]*id=["']__next["']/i,
    /React|Vue|Angular|__NEXT_DATA__|__NUXT__|ng-version/,
    /<script[^>]*src=["'][^"']*react[^"']*["']/i,
    /<script[^>]*src=["'][^"']*vue[^"']*["']/i,
  ];
  return indicators.some(pattern => pattern.test(html));
}

/**
 * Extract with Mozilla Readability
 */
async function extractWithReadability(url, html) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document, {
    charThreshold: 500,
    classesToPreserve: ['caption', 'figure', 'figcaption', 'highlight'],
  });

  const article = reader.parse();

  if (!article) {
    throw new Error('Readability returned null');
  }

  // Sanitize and enhance HTML
  let articleHtml = DOMPurify.sanitize(article.content, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'q', 'cite',
      'a', 'img', 'figure', 'figcaption', 'picture', 'source',
      'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'article', 'section',
    ],
    ALLOWED_ATTR: ['href', 'src', 'srcset', 'alt', 'title', 'target', 'class', 'id', 'width', 'height', 'loading'],
  });

  // Fix images
  articleHtml = fixImages(articleHtml, url);

  return {
    article_html: articleHtml,
    text_content: article.textContent,
    title: article.title,
    byline: article.byline,
    site_name: article.siteName,
    excerpt: article.excerpt,
    lead_image_url: null,
    published_time: null,
  };
}

/**
 * Basic extraction (fallback)
 */
function extractBasic(html, url, metadata) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const title = metadata.title || doc.querySelector('title')?.textContent || url;
  const textContent = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';

  return {
    article_html: `<p>${textContent.slice(0, 5000)}</p>`,
    text_content: textContent,
    title,
    byline: metadata.author,
    site_name: new URL(url).hostname,
    excerpt: metadata.description || textContent.slice(0, 500),
    lead_image_url: metadata.image,
    published_time: metadata.date,
  };
}

/**
 * Fix image URLs and lazy-load attributes
 */
function fixImages(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  doc.querySelectorAll('img').forEach(img => {
    // Handle lazy-load attributes
    const dataSrc = img.getAttribute('data-src')
      || img.getAttribute('data-original')
      || img.getAttribute('data-lazy-src')
      || img.getAttribute('data-srcset');

    if (dataSrc && (!img.src || img.src.includes('placeholder') || img.src.includes('data:image'))) {
      img.src = dataSrc;
    }

    // Convert relative URLs to absolute
    if (img.src && !img.src.startsWith('data:')) {
      try {
        img.src = new URL(img.src, baseUrl).href;
      } catch (e) {
        console.warn('Invalid image URL:', img.src);
      }
    }

    // Handle srcset
    if (img.srcset) {
      const srcsetParts = img.srcset.split(',').map(part => {
        const [url, descriptor] = part.trim().split(/\s+/);
        try {
          const absoluteUrl = new URL(url, baseUrl).href;
          return descriptor ? `${absoluteUrl} ${descriptor}` : absoluteUrl;
        } catch (e) {
          return part;
        }
      });
      img.srcset = srcsetParts.join(', ');
    }

    // Add loading="lazy" for performance
    if (!img.getAttribute('loading')) {
      img.setAttribute('loading', 'lazy');
    }

    // Remove inline width/height if too large
    const width = parseInt(img.getAttribute('width'));
    const height = parseInt(img.getAttribute('height'));
    if (width > 1200 || height > 1200) {
      img.removeAttribute('width');
      img.removeAttribute('height');
    }
  });

  return doc.body.innerHTML;
}

/**
 * Merge metadata from metascraper with article data
 */
function mergeMetadata(article, metadata) {
  return {
    ...article,
    byline: article.byline || metadata.author,
    site_name: article.site_name || new URL(metadata.url).hostname,
    excerpt: article.excerpt || metadata.description,
    lead_image_url: article.lead_image_url || metadata.image,
    published_time: article.published_time || metadata.date,
  };
}
