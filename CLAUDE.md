# ClaudeDuck Setup Instructions

You are setting up ClaudeDuck — a DuckDB-based analytics tool for Claude Code session data.

Follow these steps exactly. Do not skip any step.

## Step 1: Clone and install

```bash
git clone https://github.com/duyet/clauduck.git /tmp/clauduck
cd /tmp/clauduck
uv sync
```

If `uv` is not installed, install it first:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

If the repo is already cloned, just `cd` to it and run `uv sync`.

## Step 2: Load session data

Run the loader to parse all Claude Code session data from `~/.claude` into DuckDB:

```bash
uv run python load.py
```

This reads:
- `~/.claude/history.jsonl` — prompt history
- `~/.claude/projects/*/*.jsonl` — full session transcripts

It creates `claudeduck.db` with 4 tables: `history`, `sessions`, `messages`, `tool_calls`.

## Step 3: Run analytics

```bash
uv run python query.py
```

This runs 15 built-in analytics queries and prints results.

## Step 4: Present insights to the user

After running the queries, summarize the key findings for the user. Focus on:

1. **Overview**: Total sessions, projects, tokens used, total hours
2. **Top projects**: Which projects consumed the most tokens
3. **Tool usage**: Most used tools (Bash, Read, Edit, etc.)
4. **Cost estimate**: Approximate spend by model
5. **Work patterns**: Peak hours and days of the week
6. **Interesting observations**: Longest sessions, most repeated prompts, cache efficiency

Present the data clearly with tables or bullet points. Highlight anything surprising or notable.

## Step 5: Offer interactive exploration

Tell the user they can ask follow-up questions. You can run custom SQL queries against the database:

```python
import duckdb
con = duckdb.connect('claudeduck.db')
con.sql("YOUR QUERY HERE").show()
```

Available tables and key columns:

### `sessions`
- `session_id`, `project_name`, `first_ts`, `last_ts`, `duration_minutes`
- `user_messages`, `assistant_messages`, `tool_call_count`
- `total_input_tokens`, `total_output_tokens`, `total_cache_read_tokens`
- `models_used` (array), `tools_used` (array)
- `git_branch`, `version`

### `messages`
- `session_id`, `project_name`, `type` (user/assistant), `timestamp`
- `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`
- `content_text`, `tool_names` (array)

### `tool_calls`
- `session_id`, `project_name`, `timestamp`, `model`
- `tool_name`, `tool_use_id`

### `history`
- `display` (prompt text), `timestamp`, `ts`, `project`
