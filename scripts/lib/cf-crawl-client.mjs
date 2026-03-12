/**
 * cf-crawl-client.mjs — Reusable Cloudflare Browser Rendering crawl client.
 *
 * Usage:
 *   import { crawl, crawlAndWait, getStatus, getResults } from './cf-crawl-client.mjs';
 *
 *   const jobId = await crawl('https://example.com', { limit: 20, formats: ['markdown'] });
 *   const pages = await crawlAndWait('https://example.com', { limit: 5 });
 *
 * Env: CF_API_TOKEN  (required — "Browser Rendering - Edit" permission)
 *      CF_ACCOUNT_ID (required — your Cloudflare account ID)
 */

function getBase() {
  const id = process.env.CF_ACCOUNT_ID;
  if (!id) throw new Error('CF_ACCOUNT_ID env var required. Find it at: https://dash.cloudflare.com');
  return `https://api.cloudflare.com/client/v4/accounts/${id}/browser-rendering/crawl`;
}

function getHeaders() {
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error('CF_API_TOKEN env var required. Create at: https://dash.cloudflare.com/profile/api-tokens');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Fetch with HTTP status validation. */
async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
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

  const data = await safeFetch(getBase(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!data.success) throw new Error(`Crawl failed: ${JSON.stringify(data.errors)}`);
  return data.result;
}

/**
 * Get job status. Retries on "not found" (CF has a registration delay).
 */
export async function getStatus(jobId, retries = 6) {
  const base = getBase();
  for (let attempt = 0; attempt <= retries; attempt++) {
    let data;
    try {
      data = await safeFetch(`${base}/${jobId}?limit=1`, { headers: getHeaders() });
    } catch (err) {
      if (attempt < retries && err.message.includes('404')) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
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
  throw new Error(`getStatus: exceeded ${retries} retries without a successful response`);
}

/**
 * Get all results for a completed job. Handles pagination automatically.
 */
export async function getResults(jobId) {
  const base = getBase();
  const records = [];
  let cursor = null;
  do {
    const qs = cursor ? `?cursor=${cursor}` : '';
    const data = await safeFetch(`${base}/${jobId}${qs}`, { headers: getHeaders() });
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
  const data = await safeFetch(`${getBase()}/${jobId}`, { method: 'DELETE', headers: getHeaders() });
  if (!data.success) throw new Error(`Cancel failed: ${JSON.stringify(data.errors)}`);
  return true;
}

/**
 * Start a crawl and poll until complete. Returns all page records.
 * @param {string} url - Starting URL
 * @param {object} opts - Same as crawl() plus:
 *   pollInterval (ms, default 5000)
 *   maxWait (ms, default 3600000 = 1 hour)
 *   onProgress (callback receiving status object)
 */
export async function crawlAndWait(url, opts = {}) {
  const jobId = await crawl(url, opts);
  const interval = opts.pollInterval || 5000;
  const maxWait = opts.maxWait || 3600000;
  const deadline = Date.now() + maxWait;

  await new Promise(r => setTimeout(r, 5000));

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    const status = await getStatus(jobId);
    if (opts.onProgress) opts.onProgress(status);
    if (status.status !== 'running') break;
  }

  if (Date.now() >= deadline) {
    throw new Error(`crawlAndWait: timed out after ${maxWait}ms. Job ${jobId} may still be running.`);
  }

  return getResults(jobId);
}
