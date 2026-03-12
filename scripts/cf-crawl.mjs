#!/usr/bin/env node
/**
 * cf-crawl.mjs — Crawl any website via Cloudflare Browser Rendering API.
 *
 * Usage:
 *   node cf-crawl.mjs <url>                        # crawl, markdown, 10 pages
 *   node cf-crawl.mjs <url> --limit 50             # crawl up to 50 pages
 *   node cf-crawl.mjs <url> --depth 2              # max 2 links deep
 *   node cf-crawl.mjs <url> --format html           # html instead of markdown
 *   node cf-crawl.mjs <url> --json                  # structured JSON output
 *   node cf-crawl.mjs <url> --static                # skip JS rendering (faster)
 *   node cf-crawl.mjs <url> --include "/blog/**"    # only matching paths
 *   node cf-crawl.mjs <url> --exclude "/admin/*"    # skip matching paths
 *   node cf-crawl.mjs <url> --out results.json      # save to file
 *   node cf-crawl.mjs <url> --wait                  # poll until complete
 *   node cf-crawl.mjs <url> --timeout 300           # max wait time in seconds
 *   node cf-crawl.mjs --status <job_id>             # check job status
 *   node cf-crawl.mjs --fetch <job_id> --out f.json # fetch results
 *   node cf-crawl.mjs --cancel <job_id>             # cancel a job
 *
 * Env: CF_API_TOKEN  (needs "Browser Rendering - Edit" permission)
 *      CF_ACCOUNT_ID (your Cloudflare account ID)
 *
 * Output strategy:
 *   stdout = data (job ID or JSON results) — safe to pipe
 *   stderr = progress, status, errors — human-readable logs
 */

import { writeFileSync } from 'fs';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

if (!CF_ACCOUNT_ID) {
  console.error('ERROR: Set CF_ACCOUNT_ID env var to your Cloudflare account ID.');
  console.error('Find it at: https://dash.cloudflare.com → any zone → Overview → Account ID');
  process.exit(1);
}

if (!CF_API_TOKEN) {
  console.error('ERROR: Set CF_API_TOKEN env var. Needs "Browser Rendering - Edit" permission.');
  console.error('Create at: https://dash.cloudflare.com/profile/api-tokens');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl`;

const headers = {
  Authorization: `Bearer ${CF_API_TOKEN}`,
  'Content-Type': 'application/json',
};

// --- Helpers ---

const args = process.argv.slice(2);

function getFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const val = args[i + 1];
  if (!val || val.startsWith('--')) return null;
  return val;
}

function hasFlag(name) {
  return args.includes(name);
}

function getAllFlags(name) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1] && !args[i + 1].startsWith('--')) {
      values.push(args[i + 1]);
    }
  }
  return values;
}

/** Fetch with HTTP status validation. Throws on non-OK responses. */
async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`HTTP ${res.status} from Cloudflare: ${body.slice(0, 500)}`);
  }
  return res.json();
}

/** Validate a string is a well-formed URL. */
function validateUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/** Require a flag value to be a non-empty string. */
function requireFlag(name) {
  const val = getFlag(name);
  if (!val) {
    console.error(`ERROR: ${name} requires a value. Usage: ${name} <value>`);
    process.exit(1);
  }
  return val;
}

/** Fetch all paginated records for a job. */
async function fetchAllRecords(jobId) {
  const records = [];
  let cursor = null;
  do {
    const qs = cursor ? `?cursor=${cursor}` : '';
    const data = await safeFetch(`${BASE}/${jobId}${qs}`, { headers });
    records.push(...(data.result.records || []));
    cursor = data.result.cursor || null;
    console.error(`  Fetched ${records.length} records...`);
  } while (cursor);
  return records;
}

// --- Status check ---
if (hasFlag('--status')) {
  const jobId = requireFlag('--status');
  const data = await safeFetch(`${BASE}/${jobId}?limit=1`, { headers });
  if (!data.success) {
    console.error('Error:', data.errors);
    process.exit(1);
  }
  const r = data.result;
  console.log(`Job: ${r.id}`);
  console.log(`Status: ${r.status}`);
  console.log(`Progress: ${r.finished}/${r.total} pages`);
  console.log(`Browser time: ${r.browserSecondsUsed}s`);

  if (r.status === 'completed' || r.finished > 0) {
    console.log(`\nFetch results: node cf-crawl.mjs --fetch ${r.id}`);
  }
  process.exit(0);
}

// --- Fetch results ---
if (hasFlag('--fetch')) {
  const jobId = requireFlag('--fetch');
  const outFile = getFlag('--out');
  const allRecords = await fetchAllRecords(jobId);

  const output = JSON.stringify(allRecords, null, 2);
  if (outFile) {
    writeFileSync(outFile, output);
    console.log(`Saved ${allRecords.length} records to ${outFile}`);
  } else {
    console.log(output);
  }
  process.exit(0);
}

// --- Cancel job ---
if (hasFlag('--cancel')) {
  const jobId = requireFlag('--cancel');
  const data = await safeFetch(`${BASE}/${jobId}`, { method: 'DELETE', headers });
  console.log(data.success ? `Cancelled job ${jobId}` : `Error: ${JSON.stringify(data.errors)}`);
  process.exit(0);
}

// --- Start crawl ---
const url = args.find(a => validateUrl(a));
if (!url) {
  console.error('Usage: node cf-crawl.mjs <url> [options]');
  console.error('       node cf-crawl.mjs --status <job_id>');
  console.error('       node cf-crawl.mjs --fetch <job_id> [--out file.json]');
  process.exit(1);
}

const limit = getFlag('--limit');
const depth = getFlag('--depth');
const format = getFlag('--format');
const outFile = getFlag('--out');
const includePatterns = getAllFlags('--include');
const excludePatterns = getAllFlags('--exclude');
const isStatic = hasFlag('--static');
const isJson = hasFlag('--json');
const wait = hasFlag('--wait');
const timeoutSec = parseInt(getFlag('--timeout') || '3600');

// Build request body
const body = { url };

if (limit) body.limit = parseInt(limit);
if (depth) body.depth = parseInt(depth);

// Format selection — mutually exclusive
const formats = [];
if (isJson) formats.push('json');
else if (format === 'html') formats.push('html');
else formats.push('markdown');
body.formats = formats;

body.render = !isStatic;

const options = {};
if (includePatterns.length) options.includePatterns = includePatterns;
if (excludePatterns.length) options.excludePatterns = excludePatterns;
if (Object.keys(options).length) body.options = options;

body.rejectResourceTypes = ['image', 'media', 'font'];

console.error(`Crawling: ${url}`);
console.error(`Config: limit=${body.limit || 10}, depth=${body.depth || 'CF default'}, format=${formats.join(',')}, render=${body.render}`);

const data = await safeFetch(BASE, {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
});

if (!data.success) {
  console.error('Error starting crawl:', JSON.stringify(data.errors, null, 2));
  process.exit(1);
}

const jobId = data.result;
console.error(`Job started: ${jobId}`);

if (!wait) {
  console.log(jobId);
  console.error(`\nCheck status: node cf-crawl.mjs --status ${jobId}`);
  console.error(`Fetch results: node cf-crawl.mjs --fetch ${jobId} --out results.json`);
  process.exit(0);
}

// --- Poll and wait for results (bounded by --timeout) ---
console.error(`Waiting for results (timeout: ${timeoutSec}s)...`);
const deadline = Date.now() + timeoutSec * 1000;
await new Promise(r => setTimeout(r, 5000));

let result;
let notFoundRetries = 0;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 5000));

  let pollData;
  try {
    pollData = await safeFetch(`${BASE}/${jobId}?limit=1`, { headers });
  } catch (err) {
    if (notFoundRetries < 6 && err.message.includes('404')) {
      notFoundRetries++;
      console.error(`  Waiting for job to register... (${notFoundRetries}/6)`);
      continue;
    }
    throw err;
  }

  if (!pollData.success) {
    if (notFoundRetries < 6 && pollData.errors?.some(e => e.code === 1001)) {
      notFoundRetries++;
      console.error(`  Waiting for job to register... (${notFoundRetries}/6)`);
      continue;
    }
    console.error('Poll error:', pollData.errors);
    process.exit(1);
  }

  result = pollData.result;
  console.error(`  ${result.status}: ${result.finished}/${result.total} pages (${result.browserSecondsUsed}s)`);

  if (result.status !== 'running') break;
}

if (!result) {
  console.error(`ERROR: Timed out after ${timeoutSec}s. Job ${jobId} may still be running.`);
  console.error(`Check status: node cf-crawl.mjs --status ${jobId}`);
  process.exit(1);
}

if (result.status !== 'completed') {
  console.error(`Job ended with status: ${result.status}`);
}

const allRecords = await fetchAllRecords(jobId);

console.error(`\nDone: ${allRecords.length} pages crawled in ${result.browserSecondsUsed}s`);

const output = JSON.stringify(allRecords, null, 2);
if (outFile) {
  writeFileSync(outFile, output);
  console.log(`Saved to ${outFile}`);
} else {
  console.log(output);
}
