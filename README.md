# ClauDuck

Analyze your Claude Code usage with DuckDB. Load your local `~/.claude` session history into a queryable database and get insights about your coding patterns, token usage, costs, and tool usage.

Inspired by [ClickHouse/alexeyprompts](https://github.com/ClickHouse/alexeyprompts), but using DuckDB for zero-setup local analytics.

## Quick Start

```bash
npx clauduck
```

This will:
1. Load all your `~/.claude` session data into DuckDB (`~/.claude/clauduck.db`)
2. Run 15 built-in analytics queries
3. Print results to the terminal

### Interactive TUI

```bash
npx clauduck tui
```

Browse pre-built queries, run custom SQL, and explore your data interactively.

### Date Filtering

```bash
npx clauduck --last 7d                # last 7 days
npx clauduck --last 4w                # last 4 weeks
npx clauduck --since 2025-01-01       # from a date
npx clauduck --since 2025-01-01 --until 2025-06-30  # date range
npx clauduck --source projects        # only project sessions
```

## Claude Code Integration

Copy and paste this into your Claude Code session:

```
Read and follow the instructions at https://raw.githubusercontent.com/duyet/clauduck/main/CLAUDE.md — set up ClauDuck locally and give me insights about my Claude Code usage
```

Claude will automatically set up, load data, run analytics, and present a rich dashboard.

## What Gets Analyzed

### Data Sources

| Source | Path | Content |
|--------|------|---------|
| History | `~/.claude/history.jsonl` | User prompt log with timestamps and project |
| Sessions | `~/.claude/projects/*/*.jsonl` | Full conversation transcripts with tool calls, tokens, models |
| Transcripts | `~/.claude/transcripts/*.jsonl` | Lightweight transcripts (older sessions) |
| Metadata | `~/.claude/sessions/*.json` | Session metadata (pid, cwd, kind) |

### Database Schema

All data lives in a single `events` table with a `type` column:

| Type | Description |
|------|-------------|
| `session` | One row per session with aggregated stats (tokens, tools, duration) |
| `message` | Individual messages with token counts and tool names |
| `tool_call` | Every tool invocation (Bash, Read, Edit, etc.) |
| `history` | Every prompt you've typed with timestamps |

### Built-in Analytics (15 queries)

| # | Query | What it shows |
|---|-------|---------------|
| 1 | Overview | Total sessions, projects, tokens, hours |
| 2 | Daily activity | Sessions, messages, tokens per day |
| 3 | Top projects | Projects ranked by token usage |
| 4 | Tool ranking | Most used tools across all sessions |
| 5 | Cost estimate | Estimated USD cost by model (Haiku/Sonnet/Opus) |
| 6 | Hourly pattern | What hours you code most |
| 7 | Day of week | Weekday vs weekend patterns |
| 8 | Longest sessions | Sessions by duration |
| 9 | Token-heavy sessions | Most expensive sessions |
| 10 | Cache efficiency | Cache hit rates by project |
| 11 | Complexity distribution | Session size buckets |
| 12 | Weekly trends | Week-over-week usage |
| 13 | Git branches | Activity per branch |
| 14 | Version history | Claude Code versions used |
| 15 | Repeated prompts | Your most-typed commands |

## Custom Queries

The database is standard DuckDB with a single `events` table. After running `npx clauduck`, you can query it directly:

```bash
duckdb ~/.claude/clauduck.db
```

```sql
-- Find sessions where you used Agent tool more than 10 times
SELECT session_id, project_name, tool_call_count, duration_minutes
FROM events
WHERE type='session' AND 'Agent' = ANY(tools_used) AND tool_call_count > 100
ORDER BY tool_call_count DESC;

-- Average tokens per hour by project
SELECT
    project_name,
    round(sum(total_input_tokens + total_output_tokens) / nullif(sum(duration_minutes / 60.0), 0) / 1e6, 2) as tokens_M_per_hour
FROM events
WHERE type='session' AND duration_minutes > 10
GROUP BY 1
ORDER BY 2 DESC;
```

## Development

```bash
git clone https://github.com/duyet/clauduck.git
cd clauduck
bun install
bun run build     # Build with tsup
bun run test      # Run tests with vitest
bun run dev       # Run CLI in dev mode (tsx)
```

## Privacy

All data stays local. ClauDuck reads only from your `~/.claude` directory and writes to `~/.claude/clauduck.db`. Nothing is sent to any server.

## License

MIT
