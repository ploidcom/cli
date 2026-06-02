# Ploid CLI

A lightweight command-line client for the [Ploid Public API](https://api.ploid.com/v1). It is a thin wrapper over HTTP: every command maps to a `/v1` endpoint, and all billing, auth, and enrichment logic stays in the API. The only conveniences the CLI adds are config resolution, file/stdin input, polling helpers, and human-readable output.

## Install

```bash
npm install -g @ploid/cli
# or run without installing
npx @ploid/cli auth check
```

Requires Node.js 20 or newer.

## Authentication

Create an API key in your Ploid workspace settings, then provide it in any of these ways (highest precedence first):

1. `--api-key <key>` flag
2. `PLOID_API_KEY` environment variable
3. `~/.config/ploid/config.json`:

```json
{
  "api_key": "pk_live_...",
  "base_url": "https://api.ploid.com"
}
```

Verify it works:

```bash
export PLOID_API_KEY=pk_live_...
ploid auth check
```

## Quickstart

```bash
# Look up one person
ploid people lookup --name "Jane Doe" --company "Acme"

# Reveal contact fields
ploid people enrich --linkedin-url https://www.linkedin.com/in/example \
  --fields profile,work_email,github

# Queue a bulk enrichment job from a file and wait for it to finish
ploid batch create --file ./people.json --fields linkedin,github,work_email \
  --max-cost-usd 10 --wait
```

## Global flags

| Flag | Description |
|------|-------------|
| `--api-key <key>` | API key (overrides env and config file) |
| `--base-url <url>` | API base URL (default `https://api.ploid.com`) |
| `--json` | Emit raw JSON (the `data` payload) instead of formatted output |
| `--quiet` | Suppress progress lines (printed to stderr) |

Exit codes: `0` success, `1` usage/input error, `2` API error, `3` missing auth/config.

## Commands

### Account

```bash
ploid account credits      # balance + API key budget
ploid account usage        # usage context
ploid auth check           # validate the key and print the balance
```

### People

```bash
ploid people search --query "founders in SF building AI sales tools" --mode natural --size 50
ploid people lookup --name "Jane Doe" --company "Acme"
ploid people enrich --name "Jane Doe" --company "Acme" --fields work_email,github,x
ploid people agent --query "the CTO of Ploid"
```

`--filters` accepts a JSON file (or `-` for stdin) with structured search filters.

### Batch enrichment

The input is a JSON array of people, or JSONL (one JSON object per line):

```json
[
  { "identifier": "https://www.linkedin.com/in/example", "company": "Remote" },
  { "identifier": "github:octocat" }
]
```

```bash
ploid batch estimate --file ./people.json --fields linkedin,github,work_email
ploid batch create   --file ./people.json --fields linkedin,github,work_email --webhook-url https://example.com/hook
ploid batch status batch_abc123
ploid batch results batch_abc123 --all       # fetch every page as one JSON array
ploid batch wait batch_abc123                 # poll until done, then dump results
```

Pipe input via stdin with `--file -` or by omitting `--file`:

```bash
cat people.jsonl | ploid batch create --fields github,x
```

### Searches (async People Sets)

```bash
ploid searches create --query "Sales leaders at US fintechs" --count 100 --include profile --wait
ploid searches list
ploid searches get peopleset_abc123
ploid searches items peopleset_abc123 --cursor 0 --limit 100
ploid searches refine peopleset_abc123 --query "only Series B+"
ploid searches export peopleset_abc123 --format csv --out results.csv
```

### Monitors

```bash
ploid monitors list
ploid monitors create --people-set-id peopleset_abc123 --interval-days 7
ploid monitors delete monitor_abc123
```

### Webhooks

```bash
ploid webhooks list
ploid webhooks create --url https://example.com/hook --events batch.completed,people_set.completed
ploid webhooks delete webhook_abc123
```

### LinkedIn passthrough

```bash
ploid linkedin catalog                                  # endpoints + per-call pricing
ploid linkedin call profile url=https://www.linkedin.com/in/example
ploid linkedin call profiles-search search="VP Engineering" locations="United States"
```

Parameters are passed as `key=value` pairs and forwarded as query parameters.

### Meta

```bash
ploid openapi                # print the OpenAPI spec
ploid --version
```

## Development

```bash
npm install
npm run dev -- account credits     # run from source
npm run typecheck
npm test
npm run build
```

### Testing against a staging API

```bash
PLOID_API_BASE_URL=https://staging.api.ploid.com PLOID_API_KEY=pk_test_... ploid auth check
```

## License

MIT
