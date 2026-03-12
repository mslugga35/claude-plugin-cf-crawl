---
description: Crawl a website and return clean markdown content
argument-hint: <url> [--limit N] [--depth N] [--wait]
allowed-tools: [Bash, Read, Write, Glob]
---

Crawl the given website using Cloudflare Browser Rendering API.

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/cf-crawl.mjs $ARGUMENTS`

If the user didn't specify `--wait`, add `--wait` so results are returned inline.
If the user didn't specify `--out`, add `--out /tmp/cf-crawl-results.json` and read the file after completion. Clean up the temp file when done.

After crawling, summarize:
- Total pages crawled
- Key pages found (by title)
- Any errors or skipped pages
