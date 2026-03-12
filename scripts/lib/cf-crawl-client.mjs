/**
 * cf-crawl-client.mjs — Reusable Cloudflare Browser Rendering crawl client.
 *
 * Usage:
 *   import { crawl, crawlAndWait, getStatus, getResults } from './cf-crawl-client.mjs';
 *
 *   const jobId = await crawl('https://example.com', { limit: 20, formats: ['markdown'] });
 *   const pages = await crawlAndWait('https://example.com', { limit: 5 });
 */

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

function getBase() {
  if (!CF_ACCOUNT_ID) throw new Error('CF_ACCOUNT_ID env var required');
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl`;
}

function getHeaders() {
  if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN env var required');
  return {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Start a crawl job. Returns job ID.
 */
export async function crawl(url, opts = {}) {
  const body = {
    url,
    limit: opts.limit || 10,
    formats: opts.formats || ['markdown'],
    render: opts.render !== undefined ? opts.render : true,
    rejectResourceTypes: opts.rejectResourceTypes || ['image', 'media', 'font'],
  };
  if (opts.depth) body.depth = opts.depth;
  if (opts.includePatterns || opts.excludePatterns) {
    body.options = {};
    if (opts.includePatterns) body.options.includePatterns = opts.includePatterns;
    if (opts.excludePatterns) body.options.excludePatterns = opts.excludePatterns;
  }

  const res = await fetch(getBase(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Crawl failed: ${JSON.stringify(data.errors)}`);
  return data.result;
}

/**
 * Get job status. Retries on "not found" (CF registration delay).
 */
export async function getStatus(jobId, retries = 6) {
  const base = getBase();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${base}/${jobId}?limit=1`, { headers: getHeaders() });
    const data = await res.json();
    if (!data.success) {
      const notFound = data.errors?.some(e => e.code === 1001);
      if (notFound && attempt < retries) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      throw new Error(`Status failed: ${JSON.stringify(data.errors)}`);
    }
    return data.result;
  }
}

/**
 * Get all results for a completed job. Handles pagination.
 */
export async function getResults(jobId) {
  const base = getBase();
  const records = [];
  let cursor = null;
  do {
    const qs = cursor ? `?cursor=${cursor}` : '';
    const res = await fetch(`${base}/${jobId}${qs}`, { headers: getHeaders() });
    const data = await res.json();
    if (!data.success) throw new Error(`Fetch failed: ${JSON.stringify(data.errors)}`);
    records.push(...(data.result.records || []));
    cursor = data.result.cursor || null;
  } while (cursor);
  return records;
}

/**
 * Cancel a running job.
 */
export async function cancelCrawl(jobId) {
  const res = await fetch(`${getBase()}/${jobId}`, { method: 'DELETE', headers: getHeaders() });
  const data = await res.json();
  if (!data.success) throw new Error(`Cancel failed: ${JSON.stringify(data.errors)}`);
  return true;
}

/**
 * Start a crawl and poll until complete. Returns all page records.
 */
export async function crawlAndWait(url, opts = {}) {
  const jobId = await crawl(url, opts);
  const interval = opts.pollInterval || 5000;

  while (true) {
    await new Promise(r => setTimeout(r, interval));
    const status = await getStatus(jobId);
    if (opts.onProgress) opts.onProgress(status);
    if (status.status !== 'running') break;
  }

  return getResults(jobId);
}
