# ClauDuck

Analyze your Claude Code usage with DuckDB. Load your local `~/.claude` session history into a queryable database and get insights about your coding patterns, token usage, costs, and tool usage.

Inspired by [ClickHouse/alexeyprompts](https://github.com/ClickHouse/alexeyprompts), but using DuckDB for zero-setup local analytics.

## Quick Start (One-liner for Claude Code)

Copy and paste this into your Claude Code session:

```
Read and follow the instructions at https://raw.githubusercontent.com/duyet/clauduck/main/CLAUDE.md — set up ClauDuck locally and give me insights about my Claude Code usage
```

Claude will automatically:
1. Read the setup instructions
2. Detect if it's already in the ClauDuck project (skips clone) or clone fresh
3. Install dependencies and load your `~/.claude` session data into DuckDB
4. Run analytics and present your insights

> **Already inside the repo?** The same prompt works — Claude detects `load.py` in the current directory and skips cloning.

## Manual Setup

### Prerequisites
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

### Install & Run

```bash
git clone https://github.com/duyet/clauduck.git
cd clauduck
uv sync
uv run python load.py    # Load your session data
uv run python query.py   # Run all analytics
```

### Interactive Queries

```bash
uv run python -c "
import duckdb
con = duckdb.connect('clauduck.db')
con.sql('SELECT * FROM sessions ORDER BY first_ts DESC LIMIT 10').show()
"
```

## What Gets Analyzed

### Data Sources

| Source | Path | Content |
|--------|------|---------|
| History | `~/.claude/history.jsonl` | User prompt log with timestamps and project |
| Sessions | `~/.claude/projects/*/*.jsonl` | Full conversation transcripts with tool calls, tokens, models |

### Database Tables

| Table | Description |
|-------|-------------|
| `history` | Every prompt you've typed with timestamps |
| `sessions` | One row per session with aggregated stats (tokens, tools, duration) |
| `messages` | Individual messages with token counts and tool names |
| `tool_calls` | Every tool invocation (Bash, Read, Edit, etc.) |

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

### Date Range Filtering

```bash
uv run python query.py                          # all time (default)
uv run python query.py --last 7d                # last 7 days
uv run python query.py --last 4w                # last 4 weeks
uv run python query.py --since 2025-01-01       # from a date
uv run python query.py --since 2025-01-01 --until 2025-06-30  # date range
```

## Example Dashboard Output

When run via Claude Code (one-liner), you get a rich dashboard:

**🦆 ClauDuck — Your Claude Code Analytics Dashboard**
**Period:** 2025-01-15 → 2025-07-01 (167 days)

| 📊 Sessions | 💬 Messages | 🪙 Tokens | 🛠️ Tool Calls | ⏱️ Hours | 📁 Projects |
|:-----------:|:-----------:|:---------:|:-------------:|:--------:|:-----------:|
| 2,841       | 312,500     | 248.3M    | 105,720       | 3,210    | 18          |

🏆 **Top Projects**
```
 1. my-saas-app         82.1M ██████████████████████████████░░
 2. api-gateway         51.4M ███████████████████░░░░░░░░░░░░░
 3. data-pipeline       38.7M ██████████████░░░░░░░░░░░░░░░░░░
 4. mobile-app          22.9M ████████░░░░░░░░░░░░░░░░░░░░░░░░
 5. infra-terraform     15.3M █████░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

🔧 **Tool Usage**
```
 Bash            ██████████████████████████████ 42,130
 Read            ████████████░░░░░░░░░░░░░░░░░░ 18,945
 Edit            █████████░░░░░░░░░░░░░░░░░░░░░ 14,220
 Grep            ████░░░░░░░░░░░░░░░░░░░░░░░░░░  6,871
 Agent           ███░░░░░░░░░░░░░░░░░░░░░░░░░░░  4,502
```

> 🎯 **Fun Facts**
>
> 🌙 41,200 messages sent between midnight and 2 AM — night owl confirmed.
>
> 🏃 Longest marathon session: 8.2 hours straight on my-saas-app.
>
> 🤖 Bash is your most-called tool (42K times) — terminal over everything.

## Custom Queries

The database is standard DuckDB. Write any SQL you want:

```sql
-- Find sessions where you used Agent tool more than 10 times
SELECT session_id, project_name, tool_call_count, duration_minutes
FROM sessions
WHERE 'Agent' = ANY(tools_used) AND tool_call_count > 100
ORDER BY tool_call_count DESC;

-- Average tokens per hour by project
SELECT
    project_name,
    round(sum(total_input_tokens + total_output_tokens) / nullif(sum(duration_minutes / 60.0), 0) / 1e6, 2) as tokens_M_per_hour
FROM sessions
WHERE duration_minutes > 10
GROUP BY 1
ORDER BY 2 DESC;
```

## Privacy

All data stays local. ClauDuck reads only from your `~/.claude` directory and writes only to `clauduck.db` in the project folder. Nothing is sent to any server.

## Re-loading

Run `uv run python load.py` anytime to rebuild the database with latest session data. The database is recreated from scratch each time.

## License

MIT
