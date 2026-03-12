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
 *   node cf-crawl.mjs --status <job_id>             # check job status
 *   node cf-crawl.mjs --fetch <job_id> --out f.json # fetch results
 *   node cf-crawl.mjs --cancel <job_id>             # cancel a job
 *
 * Env: CF_API_TOKEN  (needs "Browser Rendering - Edit" permission)
 *      CF_ACCOUNT_ID (your Cloudflare account ID)
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

// --- Parse args ---
const args = process.argv.slice(2);

function getFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] || true;
}

function hasFlag(name) {
  return args.includes(name);
}

function getAllFlags(name) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

// --- Status check ---
if (hasFlag('--status')) {
  const jobId = getFlag('--status');
  const res = await fetch(`${BASE}/${jobId}?limit=1`, { headers });
  const data = await res.json();
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
  const jobId = getFlag('--fetch');
  const outFile = getFlag('--out');
  let allRecords = [];
  let cursor = null;

  do {
    const qs = cursor ? `?cursor=${cursor}` : '';
    const res = await fetch(`${BASE}/${jobId}${qs}`, { headers });
    const data = await res.json();
    if (!data.success) {
      console.error('Error:', data.errors);
      process.exit(1);
    }
    allRecords.push(...(data.result.records || []));
    cursor = data.result.cursor || null;
    console.error(`Fetched ${allRecords.length} records...`);
  } while (cursor);

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
  const jobId = getFlag('--cancel');
  const res = await fetch(`${BASE}/${jobId}`, { method: 'DELETE', headers });
  const data = await res.json();
  console.log(data.success ? `Cancelled job ${jobId}` : `Error: ${JSON.stringify(data.errors)}`);
  process.exit(0);
}

// --- Start crawl ---
const url = args.find(a => a.startsWith('http'));
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

// Build request body
const body = { url };

if (limit) body.limit = parseInt(limit);
if (depth) body.depth = parseInt(depth);

const formats = [];
if (isJson) formats.push('json');
if (format === 'html') formats.push('html');
else formats.push('markdown');
if (formats.length) body.formats = formats;

if (!isStatic && !hasFlag('--render')) body.render = true;
if (isStatic) body.render = false;

const options = {};
if (includePatterns.length) options.includePatterns = includePatterns;
if (excludePatterns.length) options.excludePatterns = excludePatterns;
if (Object.keys(options).length) body.options = options;

body.rejectResourceTypes = ['image', 'media', 'font'];

console.error(`Crawling: ${url}`);
console.error(`Config: limit=${body.limit || 10}, depth=${body.depth || 'unlimited'}, format=${formats.join(',')}, render=${body.render}`);

const res = await fetch(BASE, {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
});

const data = await res.json();

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

// --- Poll and wait for results ---
console.error('Waiting for results...');
await new Promise(r => setTimeout(r, 5000));

let result;
let notFoundRetries = 0;
while (true) {
  await new Promise(r => setTimeout(r, 5000));
  const pollRes = await fetch(`${BASE}/${jobId}?limit=1`, { headers });
  const pollData = await pollRes.json();

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

if (result.status !== 'completed') {
  console.error(`Job ended with status: ${result.status}`);
}

let allRecords = [];
let cursor = null;

do {
  const qs = cursor ? `?cursor=${cursor}` : '';
  const fetchRes = await fetch(`${BASE}/${jobId}${qs}`, { headers });
  const fetchData = await fetchRes.json();
  allRecords.push(...(fetchData.result.records || []));
  cursor = fetchData.result.cursor || null;
} while (cursor);

console.error(`\nDone: ${allRecords.length} pages crawled in ${result.browserSecondsUsed}s`);

const output = JSON.stringify(allRecords, null, 2);
if (outFile) {
  writeFileSync(outFile, output);
  console.log(`Saved to ${outFile}`);
} else {
  console.log(output);
}
