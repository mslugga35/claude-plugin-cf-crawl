# cf-crawl

A Claude Code plugin that crawls any website via Cloudflare Browser Rendering API. Free alternative to Firecrawl — returns clean markdown, HTML, or JSON with no rate limits.

## Install

```bash
/plugin install cf-crawl@claude-plugins-official
```

## Setup

1. Get a Cloudflare API token with **Browser Rendering - Edit** permission at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Set environment variables:
```bash
export CF_API_TOKEN="your-token"
export CF_ACCOUNT_ID="your-account-id"
```

## Usage

### Slash Command

```
/cf-crawl:crawl https://example.com --limit 20
```

### Automatic (Skill)

Just ask Claude to crawl a site:
- "Crawl https://example.com and summarize it"
- "Scrape the pricing page from competitor.com"
- "Get all blog posts from this site"

### CLI

```bash
# Crawl and wait for results
node scripts/cf-crawl.mjs https://example.com --wait --out results.json

# Limit pages
node scripts/cf-crawl.mjs https://example.com --limit 20 --depth 3 --wait

# Filter by path
node scripts/cf-crawl.mjs https://example.com --include "/blog/**" --wait

# Static mode (faster, no JS rendering)
node scripts/cf-crawl.mjs https://example.com --static --wait

# Job management
node scripts/cf-crawl.mjs --status <job_id>
node scripts/cf-crawl.mjs --fetch <job_id> --out results.json
node scripts/cf-crawl.mjs --cancel <job_id>
```

### Programmatic

```javascript
import { crawlAndWait } from './scripts/lib/cf-crawl-client.mjs';

const pages = await crawlAndWait('https://example.com', {
  limit: 30,
  formats: ['markdown'],
  onProgress: (s) => console.log(`${s.finished}/${s.total}`),
});
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 10 | Max pages (up to 100,000) |
| `depth` | 100,000 | Max link depth |
| `formats` | `["markdown"]` | `html`, `markdown`, `json` |
| `render` | `true` | JS rendering (`false` = faster) |
| `includePatterns` | — | Wildcard include filter |
| `excludePatterns` | — | Wildcard exclude filter |

## Why not Firecrawl?

- **Free** — uses Cloudflare's included Browser Rendering
- **No extra API key** — just your existing CF token
- **No rate limits** — crawl as much as your CF plan allows
- **Jobs run up to 7 days** — results stored 14 days
- **Same output** — clean markdown, just like Firecrawl

## License

MIT
