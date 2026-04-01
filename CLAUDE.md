# ClauDuck Setup Instructions

You are setting up ClauDuck — a DuckDB-based analytics tool for Claude Code session data.

Follow these steps exactly. Do not skip any step.

## Step 1: Detect environment and install

First, check if you are already inside the ClauDuck project directory. Look for `package.json` in the current working directory with `"name": "clauduck"`.

- **If inside the ClauDuck project**: run `bun install` (or `npm install`) then `bun run build`.
- **Otherwise**: run directly with npx — no cloning needed:

```bash
npx clauduck
```

Or if you want to clone for development:
```bash
git clone https://github.com/duyet/clauduck.git /tmp/clauduck
cd /tmp/clauduck
bun install && bun run build
```

## Step 2: Load session data and run analytics

Run ClauDuck to parse all Claude Code session data from `~/.claude` into DuckDB and run analytics:

```bash
npx clauduck
```

This reads:
- `~/.claude/history.jsonl` — prompt history
- `~/.claude/projects/*/*.jsonl` — full session transcripts
- `~/.claude/transcripts/*.jsonl` — lightweight transcripts
- `~/.claude/sessions/*.json` — session metadata

It creates `~/.claude/clauduck.db` with a single `events` table (types: session, message, tool_call, history).

Then runs 15 built-in analytics queries and prints results.

## Step 4: Present the Dashboard

After running queries, present a rich, visual dashboard. This is the most important step.
You are rendering a **terminal dashboard** using only markdown and Unicode block characters.

**IMPORTANT: Do NOT use box-drawing border characters (┌ ┐ └ ┘ │ ─ ├ ┤ ┬ ┴ ┼ ╔ ╗ ╚ ╝ ║ ═).** They render poorly in most terminals and markdown viewers. Instead, use markdown headings, bold text, horizontal rules (`---`), blockquotes (`>`), and indentation for structure.

### Dashboard Structure

Render the following sections IN ORDER. Use the exact formatting patterns shown below.
Run additional custom SQL queries as needed to fill in data — don't limit yourself to query.py output.

---

#### Section 1: Header

Use a markdown heading with emoji:

**🦆 ClauDuck — Your Claude Code Analytics Dashboard**
**Period:** {earliest_date} → {latest_date} ({total_days} days)

Compute {earliest_date}, {latest_date}, and {total_days} from the actual data — do NOT hardcode any date range.

---

#### Section 2: KPI Cards

Render key metrics as a markdown table — clean and always aligned:

| 📊 Sessions | 💬 Messages | 🪙 Tokens | 🛠️ Tool Calls | ⏱️ Hours | 📁 Projects |
|:-----------:|:-----------:|:---------:|:-------------:|:--------:|:-----------:|
| 1,397       | 189,210     | 167.7M    | 63,226        | 1,774    | 23          |

#### Section 3: Top Projects Leaderboard

Use a ranked list with inline bar charts made from block characters (█░).
Scale bars proportionally to the highest value. Use **bold** for the #1 project:

🏆 **Top Projects by Token Usage**

```
 1. my-saas-app         82.1M ██████████████████████████████░░
 2. api-gateway         51.4M ███████████████████░░░░░░░░░░░░░
 3. data-pipeline       38.7M ██████████████░░░░░░░░░░░░░░░░░░
 4. mobile-app          22.9M ████████░░░░░░░░░░░░░░░░░░░░░░░░
 5. infra-terraform     15.3M █████░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### Section 4: Tool Usage Chart

Horizontal bar chart for top 10 tools inside a code block:

🔧 **Tool Usage**

```
 Bash            ██████████████████████████████ 28,567
 Read            ████████████░░░░░░░░░░░░░░░░░░ 11,827
 Edit            █████████░░░░░░░░░░░░░░░░░░░░░  8,817
 Grep            ████░░░░░░░░░░░░░░░░░░░░░░░░░░  3,714
 Agent           ███░░░░░░░░░░░░░░░░░░░░░░░░░░░  2,708
```

#### Section 5: Cost Breakdown

Use a markdown table with a bar column for visual proportion:

💰 **Estimated Cost by Model**

| Model | Input (M) | Output (M) | Est. Cost | Share |
|-------|----------:|-----------:|----------:|-------|
| claude-opus-4-6 | 0.92 | 9.59 | $733.00 | █████████░ 57% |
| glm-4.7 | 107.87 | 5.60 | $407.67 | █████░░░░░ 32% |
| step-3.5-flash | 34.95 | 0.08 | $106.07 | █░░░░░░░░░ 8% |
| **TOTAL** | | | **$1,276** | |

#### Section 6: Activity Heatmap

Render a 7x24 heatmap (days x hours) using shade characters inside a code block.
Query the data grouped by day-of-week and hour:

```sql
SELECT extract(isodow FROM timestamp)::INT as dow,
       extract(hour FROM timestamp)::INT as hour,
       count(*) as msgs
FROM events WHERE type='message' AND timestamp IS NOT NULL GROUP BY dow, hour ORDER BY dow, hour
```

Render as:

📅 **Activity Heatmap** (messages by day x hour)

```
        00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
  Mon   ▓▓ ▓▓ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ▒▒ ▒▒ ▓▓ ▒▒ ▓▓ ██ ██ ▓▓ ▒▒ ▓▓ ▓▓ ▒▒ ▒▒ ▒▒ ▓▓
  Tue   ...
  ...
  Sun   ...

  ░░ quiet  ▒▒ moderate  ▓▓ busy  ██ peak
```

Use 4 intensity levels based on quartile thresholds of the message counts.

#### Section 7: Weekly Trend Sparkline

Show a mini trend chart of tokens per week inside a code block:

📈 **Weekly Token Trend (M)**

```
  Mar 02  ▂   6.8M
  Mar 09  █  58.1M  ← peak week
  Mar 16  █  56.6M
  Mar 23  ▆  42.8M
  Mar 30  ▁   3.4M
```

Use ▁▂▃▄▅▆▇█ characters scaled to max value.

#### Section 8: Fun Facts & Insights

Generate 5-7 interesting observations. Be specific with numbers and add personality.
Use a blockquote with emoji bullets — one fact per line:

> 🎯 **Fun Facts**
>
> 🔄 You typed "/clear" 2,717 times — that's 90x per day!
>
> 🌙 Your most productive hour is 3 PM with 42.3M tokens. Night owl alert: 13.6K messages between midnight-1AM.
>
> 🏃 Longest marathon session: 8.2 hours straight on my-saas-app.
>
> 💸 Your priciest single session: 16.9M tokens on api-gateway (Jan 18) — roughly $127 in one sitting.
>
> 📦 You've used {N} different Claude Code versions in {days} days. Bleeding-edge energy.
>
> 🤖 Bash is your most-called tool (28.5K times) — you trust the terminal more than the editor.

Make each fact data-driven and derived from actual query results. Don't make things up.
Compute new queries if needed (e.g. "busiest single day", "most tool-heavy session").

#### Section 9: Total Summary

Provide a concise **all-time summary** paragraph with bold stats — the user's "career stats":

> 📋 **All-Time Summary**
>
> Across **{total_days} days** (all time), you've run **{total_sessions} sessions** in **{total_projects} projects**, exchanging **{total_messages} messages** with Claude. You consumed **{total_tokens}M tokens** ({input_M}M input, {output_M}M output, {cache_M}M cache reads) over **{total_hours} hours** of session time. Your AI assistants made **{tool_calls} tool calls**, averaging **{avg_tools_per_session} tools/session**. Estimated total spend: **${total_cost}**.

Fill in all values from SQL queries. This is the "headline" stat — make it feel complete.

#### Section 10: Motivational Quote

End with a relevant programming or productivity quote. Use plain text — no italics or special formatting that breaks in terminals:

> 💬 "First, solve the problem. Then, write the code." — John Johnson
>
> You've written 189K messages across 23 projects. That's solving real problems. Keep shipping. 🚀

Pick a quote that relates to the user's patterns (e.g. if they work late, pick a "persistence" quote; if they use many tools, pick a "craftsmanship" quote). Keep it simple — just the quote in double quotes, an em dash, and the author name. No markdown formatting on the quote itself.

### Rendering Rules

1. **All-time data** — show ALL data in the database, not just recent. Never filter by a fixed date range (no "last 30 days" or "last 14 days"). The period is always from earliest to latest session.
2. **Always use real data** — run SQL queries to get exact numbers. Never invent stats.
2. **Scale bar charts proportionally** — the longest bar should fill the available width.
3. **NO box-drawing borders** — no `┌ ┐ └ ┘ │ ─` or `╔ ╗ ╚ ╝ ║ ═`. Use markdown tables, blockquotes, headings, and `---` instead.
4. **Use block elements for charts** — `█ ▇ ▆ ▅ ▄ ▃ ▂ ▁ ░ ▒ ▓` for bars and heatmaps inside code blocks.
5. **Emoji sparingly** — one per section header, one per fun fact. Not in data cells.
6. **Numbers are human-readable** — use commas (1,397), round decimals, use M/K suffixes.
7. **Highlight extremes** — annotate with ← peak, ← lowest, etc.
8. **Keep it scannable** — a user should grasp the story in 10 seconds.

### Custom Queries to Run

Beyond query.py output, run these additional queries for the dashboard:

```sql
-- Busiest single day
SELECT date_trunc('day', first_ts)::DATE as d, count(*) as sessions,
       sum(user_messages + assistant_messages) as msgs
FROM events WHERE type='session' AND first_ts IS NOT NULL GROUP BY d ORDER BY msgs DESC LIMIT 1;

-- Day x hour heatmap data
SELECT extract(isodow FROM timestamp)::INT as dow,
       extract(hour FROM timestamp)::INT as hour,
       count(*) as msgs
FROM events WHERE type='message' AND timestamp IS NOT NULL GROUP BY dow, hour ORDER BY dow, hour;

-- Average session length trend
SELECT date_trunc('week', first_ts)::DATE as w,
       round(avg(duration_minutes), 0) as avg_min,
       round(avg(user_messages), 0) as avg_user_msgs
FROM events WHERE type='session' AND first_ts IS NOT NULL AND duration_minutes > 0
GROUP BY w ORDER BY w;

-- Most tool-heavy single session
SELECT project_name, tool_call_count, duration_minutes, first_ts::DATE
FROM events WHERE type='session' ORDER BY tool_call_count DESC LIMIT 1;
```

## Step 5: Offer interactive exploration

After the dashboard, invite the user to explore further:

> 🔍 **Explore More**
>
> Ask me anything! I can run custom SQL against your data.
>
> Try:
> - "Show me my most expensive sessions this week"
> - "Which project uses Agent tool the most?"
> - "What's my average session length by project?"
> - "Show tool usage trends over time"
>
> **Table:** `events` (filter by `type` column)

### Schema Reference (for custom queries)

#### `events` table — single unified table

**type column** determines the row kind: `'session'`, `'message'`, `'tool_call'`, `'history'`

**Session rows** (`WHERE type='session'`):
- `session_id`, `project_name`, `first_ts`, `last_ts`, `duration_minutes`
- `user_messages`, `assistant_messages`, `tool_call_count`
- `total_input_tokens`, `total_output_tokens`, `total_cache_read_tokens`
- `models_used` (array), `tools_used` (array)
- `git_branch`, `version`

**Message rows** (`WHERE type='message'`):
- `session_id`, `project_name`, `message_type` (user/assistant), `timestamp`
- `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`
- `content_text`, `tool_names` (array)

**Tool call rows** (`WHERE type='tool_call'`):
- `session_id`, `project_name`, `timestamp`, `model`
- `tool_name`, `tool_use_id`

**History rows** (`WHERE type='history'`):
- `display` (prompt text), `timestamp`, `session_id`
