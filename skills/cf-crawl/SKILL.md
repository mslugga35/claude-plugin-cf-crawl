---
name: cf-crawl
description: This skill should be used when the user asks to crawl a website, scrape pages, get site content, extract text from a URL, audit a site, or monitor competitors. Triggers on "crawl", "scrape", "get all pages from", "site content", "extract text from", "what's on this website".
version: 1.0.0
---

# Cloudflare Crawl

Crawl any website with one command via Cloudflare Browser Rendering API. Returns clean markdown. Free — no Firecrawl subscription needed.

## Setup

1. Get a Cloudflare API token with **Browser Rendering - Edit** permission at https://dash.cloudflare.com/profile/api-tokens
2. Set env vars:
   - `CF_API_TOKEN` — your Cloudflare API token (required)
   - `CF_ACCOUNT_ID` — your Cloudflare account ID (required)

## CLI Usage

```bash
# Crawl a site (returns job ID immediately)
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs https://example.com

# Crawl and wait for results
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs https://example.com --wait --out results.json

# Limit pages and depth
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs https://example.com --limit 20 --depth 3 --wait

# Only crawl specific sections
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs https://example.com --include "/blog/**" --wait

# Skip JS rendering (faster for static sites)
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs https://example.com --static --wait

# Check status / fetch results / cancel
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs --status <job_id>
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs --fetch <job_id> --out results.json
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs --cancel <job_id>
```

## Programmatic Usage

```javascript
import { crawlAndWait } from '${CLAUDE_PLUGIN_ROOT}/scripts/lib/cf-crawl-client.mjs';

const pages = await crawlAndWait('https://competitor.com', {
  limit: 30,
  formats: ['markdown'],
  onProgress: (s) => console.log(`${s.finished}/${s.total}`),
});

for (const page of pages) {
  if (page.status === 'completed') {
    console.log(page.metadata.title, page.markdown.length, 'chars');
  }
}
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 10 | Max pages to crawl (max 100,000) |
| `depth` | CF default | Max link depth (omitted = no client-side limit) |
| `formats` | `["markdown"]` | `html`, `markdown`, `json` |
| `render` | `true` | Execute JS; `false` for static HTML (faster) |
| `includePatterns` | — | Wildcard include (e.g., `"/blog/**"`) |
| `excludePatterns` | — | Wildcard exclude (e.g., `"/admin/*"`) |

## Common Patterns

### Competitor Monitoring
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs https://competitor.com --include "/pricing**" --include "/features**" --limit 10 --wait --out competitor.json
```

### SEO Content Audit
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs https://yoursite.com --limit 100 --wait --out audit.json
```

### Feed to Claude for Analysis
```javascript
const pages = await crawlAndWait(url, { limit: 20 });
const content = pages
  .filter(p => p.status === 'completed')
  .map(p => `## ${p.metadata.title}\n${p.markdown}`)
  .join('\n\n---\n\n');
```

## Limits & Gotchas

- Free Cloudflare Workers plan included
- Jobs run up to 7 days, results stored 14 days
- Respects robots.txt
- Job registration has ~5s delay (handled automatically)
- Only follows same-domain links by default
- `excludePatterns` beats `includePatterns` if both match
