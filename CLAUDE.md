# ClauDuck Setup Instructions

You are setting up ClauDuck — a DuckDB-based analytics tool for Claude Code session data.

Follow these steps exactly. Do not skip any step.

## Step 1: Detect environment and install

First, check if you are already inside the ClauDuck project directory. Look for `load.py` and `query.py` in the current working directory.

- **If `load.py` exists in the current directory**: you are already in the ClauDuck project. Skip cloning — just run `uv sync`.
- **Otherwise**: clone the repo and cd into it:

```bash
git clone https://github.com/duyet/clauduck.git /tmp/clauduck
cd /tmp/clauduck
uv sync
```

If `uv` is not installed, install it first:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Step 2: Load session data

Run the loader to parse all Claude Code session data from `~/.claude` into DuckDB:

```bash
uv run python load.py
```

This reads:
- `~/.claude/history.jsonl` — prompt history
- `~/.claude/projects/*/*.jsonl` — full session transcripts

It creates `clauduck.db` with 4 tables: `history`, `sessions`, `messages`, `tool_calls`.

## Step 3: Run analytics

```bash
uv run python query.py
```

This runs 15 built-in analytics queries and prints results.

## Step 4: Present the Dashboard

After running queries, present a rich, visual dashboard. This is the most important step.
You are rendering a **terminal dashboard** using only markdown and Unicode. Make it beautiful.

### Dashboard Structure

Render the following sections IN ORDER. Use the exact formatting patterns shown below.
Run additional custom SQL queries as needed to fill in data — don't limit yourself to query.py output.

---

#### Section 1: Header Banner

```
╔══════════════════════════════════════════════════════════════╗
║  🦆 ClauDuck — Your Claude Code Analytics Dashboard        ║
║  Period: {earliest_date} → {latest_date} ({days} days)     ║
╚══════════════════════════════════════════════════════════════╝
```

#### Section 2: KPI Cards

Render 4-6 key metrics as inline cards using box-drawing characters:

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 📊 Sessions │ │ 💬 Messages │ │ 🪙 Tokens   │ │ 🛠️ Tools    │ │ ⏱️ Hours    │
│    1,397    │ │   189,210   │ │   167.7M    │ │   63,226    │ │   1,774     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

#### Section 3: Top Projects Leaderboard

Use a ranked list with bar charts made from Unicode block characters (▓▒░ or █▇▆▅▄▃▂▁).
Scale bars proportionally to the highest value:

```
🏆 Top Projects by Token Usage

 1. monorepo              56.3M ████████████████████████████░░░░ 
 2. clickhouse/monitor    35.7M █████████████████░░░░░░░░░░░░░░░
 3. llama-index           33.4M ████████████████░░░░░░░░░░░░░░░░
 4. stamp                 15.2M ████████░░░░░░░░░░░░░░░░░░░░░░░░
 5. agentstate            10.6M █████░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### Section 4: Tool Usage Chart

Horizontal bar chart for top 10 tools:

```
🔧 Tool Usage

 Bash   ██████████████████████████████ 28,567
 Read   ████████████░░░░░░░░░░░░░░░░░░ 11,827
 Edit   █████████░░░░░░░░░░░░░░░░░░░░░  8,817
 Grep   ████░░░░░░░░░░░░░░░░░░░░░░░░░░  3,714
 Agent  ███░░░░░░░░░░░░░░░░░░░░░░░░░░░  2,708
 ...
```

#### Section 5: Cost Breakdown

Use a table with a visual cost proportion:

```
💰 Estimated Cost by Model

 Model               │ Input (M) │ Output (M) │  Est. Cost │ Share
 ─────────────────────┼───────────┼────────────┼────────────┼─────────────
 claude-opus-4-6      │     0.92  │      9.59  │    $733.00 │ █████████░ 57%
 glm-4.7              │   107.87  │      5.60  │    $407.67 │ █████░░░░░ 32%
 step-3.5-flash       │    34.95  │      0.08  │    $106.07 │ █░░░░░░░░░  8%
 ─────────────────────┼───────────┼────────────┼────────────┼───────────
 TOTAL                │           │            │  $1,276.00 │
```

#### Section 6: Activity Heatmap

Render a 7×24 heatmap (days × hours) using shade characters. Query the data grouped by day-of-week and hour:

```sql
SELECT extract(isodow FROM timestamp) as dow, extract(hour FROM timestamp) as hour,
       count(*) as msgs FROM messages WHERE timestamp IS NOT NULL GROUP BY 1, 2
```

Render as:

```
📅 Activity Heatmap (messages by day × hour)

        00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
  Mon   ▓▓ ▓▓ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ▒▒ ▒▒ ▓▓ ▒▒ ▓▓ ██ ██ ▓▓ ▒▒ ▓▓ ▓▓ ▒▒ ▒▒ ▒▒ ▓▓
  Tue   ...
  ...
  Sun   ...

  Legend: ░░ quiet  ▒▒ moderate  ▓▓ busy  ██ peak
```

Use 4 intensity levels based on quartile thresholds of the message counts.

#### Section 7: Weekly Trend Sparkline

Show a mini trend chart of tokens per week:

```
📈 Weekly Token Trend (M)

  Mar 02 ▂▂▂  6.8M
  Mar 09 ████ 58.1M  ← peak week
  Mar 16 ████ 56.6M
  Mar 23 ████ 42.8M
  Mar 30 ▁▁▁  3.4M
```

Use ▁▂▃▄▅▆▇█ characters scaled to max value.

#### Section 8: Fun Facts & Insights

Generate 5-7 interesting observations. Be specific with numbers and add personality.
Use callout boxes:

```
┌─ 🎯 Fun Facts ─────────────────────────────────────────────┐
│                                                             │
│  🔄 You typed "/clear" 2,717 times — that's 90× per day!  │
│                                                             │
│  🌙 Your most productive hour is 3 PM with 42.3M tokens.  │
│     Night owl alert: 13.6K messages between midnight-1AM.  │
│                                                             │
│  🏃 Longest marathon: 5.4 days straight on llama-index.    │
│                                                             │
│  💸 Your priciest single session: 16.9M tokens on          │
│     monorepo (March 28) — roughly $XX in one sitting.      │
│                                                             │
│  📦 You've used 15 different Claude Code versions in       │
│     30 days. Bleeding-edge energy.                         │
│                                                             │
│  🤖 Bash is your most-called tool (28.5K times) — you     │
│     trust the terminal more than the editor.               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Make each fact data-driven and derived from actual query results. Don't make things up.
Compute new queries if needed (e.g. "busiest single day", "most tool-heavy session").

#### Section 9: Motivational Quote

End with a relevant programming or productivity quote, rotated based on the data:

```
┌─ 💬 ──────────────────────────────────────────────────────┐
│  "First, solve the problem. Then, write the code."        │
│                                    — John Johnson          │
│                                                            │
│  You've written 189K messages across 23 projects.          │
│  That's solving real problems. Keep shipping. 🚀           │
└────────────────────────────────────────────────────────────┘
```

Pick a quote that relates to the user's patterns (e.g. if they work late, pick a "persistence" quote; if they use many tools, pick a "craftsmanship" quote).

### Rendering Rules

1. **Always use real data** — run SQL queries to get exact numbers. Never invent stats.
2. **Scale bar charts proportionally** — the longest bar should fill the available width.
3. **Use Unicode box-drawing** — `┌ ┐ └ ┘ │ ─ ├ ┤ ┬ ┴ ┼` for clean boxes.
4. **Use block elements for charts** — `█ ▇ ▆ ▅ ▄ ▃ ▂ ▁ ░ ▒ ▓` for bars and heatmaps.
5. **Emoji sparingly** — one per section header, one per fun fact. Not in data.
6. **Numbers are human-readable** — use commas (1,397), round decimals, use M/K suffixes.
7. **Highlight extremes** — annotate with ← peak, ← lowest, etc.
8. **Keep it scannable** — a user should grasp the story in 10 seconds.

### Custom Queries to Run

Beyond query.py output, run these additional queries for the dashboard:

```sql
-- Busiest single day
SELECT date_trunc('day', first_ts)::DATE as day, count(*) as sessions,
       sum(user_messages + assistant_messages) as msgs
FROM sessions WHERE first_ts IS NOT NULL GROUP BY 1 ORDER BY msgs DESC LIMIT 1;

-- Day × hour heatmap data
SELECT extract(isodow FROM timestamp)::INT as dow,
       extract(hour FROM timestamp)::INT as hour,
       count(*) as msgs
FROM messages WHERE timestamp IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;

-- Average session length trend
SELECT date_trunc('week', first_ts)::DATE as week,
       round(avg(duration_minutes), 0) as avg_min,
       round(avg(user_messages), 0) as avg_user_msgs
FROM sessions WHERE first_ts IS NOT NULL AND duration_minutes > 0
GROUP BY 1 ORDER BY 1;

-- Most tool-heavy single session
SELECT project_name, tool_call_count, duration_minutes, first_ts::DATE
FROM sessions ORDER BY tool_call_count DESC LIMIT 1;
```

## Step 5: Offer interactive exploration

After the dashboard, invite the user to explore further:

```
┌─ 🔍 Explore More ──────────────────────────────────────────┐
│                                                             │
│  Ask me anything! I can run custom SQL against your data.   │
│                                                             │
│  Try:                                                       │
│  • "Show me my most expensive sessions this week"          │
│  • "Which project uses Agent tool the most?"               │
│  • "What's my average session length by project?"          │
│  • "Show tool usage trends over time"                      │
│                                                             │
│  Tables: sessions · messages · tool_calls · history         │
└─────────────────────────────────────────────────────────────┘
```

### Schema Reference (for custom queries)

#### `sessions`
- `session_id`, `project_name`, `first_ts`, `last_ts`, `duration_minutes`
- `user_messages`, `assistant_messages`, `tool_call_count`
- `total_input_tokens`, `total_output_tokens`, `total_cache_read_tokens`
- `models_used` (array), `tools_used` (array)
- `git_branch`, `version`

#### `messages`
- `session_id`, `project_name`, `type` (user/assistant), `timestamp`
- `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`
- `content_text`, `tool_names` (array)

#### `tool_calls`
- `session_id`, `project_name`, `timestamp`, `model`
- `tool_name`, `tool_use_id`

#### `history`
- `display` (prompt text), `timestamp`, `ts`, `project`
