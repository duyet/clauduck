#!/usr/bin/env python3
"""Load Claude Code session data into DuckDB for analysis.

Supports all data sources:
  - ~/.claude/history.jsonl          (prompt history, Sep 2025+)
  - ~/.claude/projects/*/*.jsonl     (rich session logs, Mar 2026+)
  - ~/.claude/transcripts/*.jsonl    (lightweight transcripts, Jan-Mar 2026)
  - ~/.claude/sessions/*.json        (session metadata)
"""

import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime, timezone

import duckdb

CLAUDE_DIR = Path.home() / ".claude"
DB_PATH = Path(__file__).parent / "clauduck.db"


def parse_timestamp(ts_val) -> datetime | None:
    """Normalize any timestamp format to datetime."""
    if ts_val is None:
        return None
    if isinstance(ts_val, str):
        try:
            return datetime.fromisoformat(ts_val.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    if isinstance(ts_val, (int, float)):
        try:
            return datetime.fromtimestamp(ts_val / 1000, tz=timezone.utc)
        except (ValueError, OSError):
            return None
    return None


def extract_project_name(dir_name: str) -> str:
    """Extract human-readable project name from directory hash."""
    parts = dir_name.replace("-", "/").strip("/").split("/")
    if "project" in parts:
        idx = parts.index("project")
        return "/".join(parts[idx + 1:]) if idx + 1 < len(parts) else parts[-1]
    return parts[-1] if parts else dir_name


def create_tables(con: duckdb.DuckDBPyConnection):
    """Create all analytics tables."""

    con.execute("""
        CREATE OR REPLACE TABLE history (
            display VARCHAR,
            timestamp BIGINT,
            ts TIMESTAMP,
            project VARCHAR,
            session_id VARCHAR
        )
    """)

    con.execute("""
        CREATE OR REPLACE TABLE sessions (
            session_id VARCHAR,
            source VARCHAR,
            project_dir VARCHAR,
            project_name VARCHAR,
            file_path VARCHAR,
            file_size_mb DOUBLE,
            first_ts TIMESTAMP,
            last_ts TIMESTAMP,
            duration_minutes DOUBLE,
            version VARCHAR,
            git_branch VARCHAR,
            message_count INTEGER,
            user_messages INTEGER,
            assistant_messages INTEGER,
            total_input_tokens BIGINT,
            total_output_tokens BIGINT,
            total_cache_read_tokens BIGINT,
            total_cache_creation_tokens BIGINT,
            models_used VARCHAR[],
            tools_used VARCHAR[],
            tool_call_count INTEGER
        )
    """)

    con.execute("""
        CREATE OR REPLACE TABLE messages (
            session_id VARCHAR,
            source VARCHAR,
            project_name VARCHAR,
            uuid VARCHAR,
            type VARCHAR,
            timestamp TIMESTAMP,
            model VARCHAR,
            input_tokens BIGINT,
            output_tokens BIGINT,
            cache_read_tokens BIGINT,
            cache_creation_tokens BIGINT,
            content_text VARCHAR,
            content_length INTEGER,
            tool_names VARCHAR[],
            git_branch VARCHAR,
            version VARCHAR,
            cwd VARCHAR
        )
    """)

    con.execute("""
        CREATE OR REPLACE TABLE tool_calls (
            session_id VARCHAR,
            source VARCHAR,
            project_name VARCHAR,
            timestamp TIMESTAMP,
            model VARCHAR,
            tool_name VARCHAR,
            tool_use_id VARCHAR,
            input_tokens BIGINT,
            output_tokens BIGINT
        )
    """)

    con.execute("""
        CREATE OR REPLACE TABLE session_metadata (
            session_id VARCHAR,
            pid INTEGER,
            cwd VARCHAR,
            started_at TIMESTAMP,
            kind VARCHAR,
            entrypoint VARCHAR,
            name VARCHAR
        )
    """)


def load_history(con: duckdb.DuckDBPyConnection):
    """Load history.jsonl — prompt history since Sep 2025."""
    history_file = CLAUDE_DIR / "history.jsonl"
    if not history_file.exists():
        print("  No history.jsonl found, skipping")
        return

    rows = []
    with open(history_file) as f:
        for line in f:
            try:
                obj = json.loads(line.strip())
                ts_ms = obj.get("timestamp", 0)
                ts = parse_timestamp(ts_ms)
                rows.append((
                    obj.get("display", ""),
                    ts_ms,
                    ts,
                    obj.get("project", ""),
                    obj.get("sessionId"),
                ))
            except Exception:
                continue

    if rows:
        con.executemany("INSERT INTO history VALUES (?, ?, ?, ?, ?)", rows)
    print(f"  Loaded {len(rows):,} history entries")


def load_session_metadata(con: duckdb.DuckDBPyConnection):
    """Load session metadata from ~/.claude/sessions/*.json."""
    sessions_dir = CLAUDE_DIR / "sessions"
    if not sessions_dir.exists():
        print("  No sessions directory found, skipping")
        return

    rows = []
    for fpath in sessions_dir.glob("*.json"):
        try:
            with open(fpath) as f:
                obj = json.load(f)
            rows.append((
                obj.get("sessionId", ""),
                obj.get("pid"),
                obj.get("cwd", ""),
                parse_timestamp(obj.get("startedAt")),
                obj.get("kind", ""),
                obj.get("entrypoint", ""),
                obj.get("name", ""),
            ))
        except Exception:
            continue

    if rows:
        con.executemany("INSERT INTO session_metadata VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    print(f"  Loaded {len(rows):,} session metadata entries")


def process_project_session(fpath: Path, project_dir: str, project_name: str):
    """Process a single project session JSONL file (rich format)."""
    session_id = fpath.stem
    file_size_mb = fpath.stat().st_size / (1024 * 1024)

    messages_raw = []
    errors = 0
    try:
        with open(fpath) as f:
            for line in f:
                try:
                    messages_raw.append(json.loads(line.strip()))
                except json.JSONDecodeError:
                    errors += 1
    except Exception:
        return None, [], [], errors + 1

    if not messages_raw:
        return None, [], [], errors

    first_ts = None
    last_ts = None
    version = None
    git_branch = None
    user_count = 0
    assistant_count = 0
    total_input = 0
    total_output = 0
    total_cache_read = 0
    total_cache_creation = 0
    models = set()
    tools = set()
    tool_count = 0
    message_rows = []
    tool_rows = []

    for msg in messages_raw:
        msg_type = msg.get("type")
        ts = parse_timestamp(msg.get("timestamp"))

        if ts:
            if first_ts is None or ts < first_ts:
                first_ts = ts
            if last_ts is None or ts > last_ts:
                last_ts = ts

        if not version and msg.get("version"):
            version = msg["version"]
        if not git_branch and msg.get("gitBranch"):
            git_branch = msg["gitBranch"]

        if msg_type == "user":
            user_count += 1
        elif msg_type == "assistant":
            assistant_count += 1

        api_msg = msg.get("message", {})
        if not isinstance(api_msg, dict):
            continue

        usage = api_msg.get("usage", {})
        model = api_msg.get("model", "")

        input_t = usage.get("input_tokens", 0) or 0
        output_t = usage.get("output_tokens", 0) or 0
        cache_read = usage.get("cache_read_input_tokens", 0) or 0
        cache_create = usage.get("cache_creation_input_tokens", 0) or 0

        total_input += input_t
        total_output += output_t
        total_cache_read += cache_read
        total_cache_creation += cache_create

        if model:
            models.add(model)

        content = api_msg.get("content", [])
        msg_tools = []
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    tool_name = block.get("name", "unknown")
                    tools.add(tool_name)
                    msg_tools.append(tool_name)
                    tool_count += 1
                    tool_rows.append((
                        session_id, "projects", project_name, ts, model,
                        tool_name, block.get("id", ""), input_t, output_t,
                    ))

        # Extract text content
        text_content = ""
        if isinstance(content, list):
            text_parts = [b.get("text", "") for b in content
                          if isinstance(b, dict) and b.get("type") == "text"]
            text_content = "\n".join(text_parts)[:2000]
        elif isinstance(content, str):
            text_content = content[:2000]

        if msg_type in ("user", "assistant"):
            if msg_type == "user" and not text_content:
                raw_content = api_msg.get("content", "")
                if isinstance(raw_content, str):
                    text_content = raw_content[:2000]

            message_rows.append((
                session_id, "projects", project_name, msg.get("uuid", ""),
                msg_type, ts, model or None,
                input_t, output_t, cache_read, cache_create,
                text_content or None, len(text_content) if text_content else 0,
                msg_tools or None,
                msg.get("gitBranch"), msg.get("version"), msg.get("cwd"),
            ))

    duration = None
    if first_ts and last_ts:
        duration = (last_ts - first_ts).total_seconds() / 60.0

    session_row = (
        session_id, "projects", project_dir, project_name, str(fpath), file_size_mb,
        first_ts, last_ts, duration, version, git_branch,
        len(messages_raw), user_count, assistant_count,
        total_input, total_output, total_cache_read, total_cache_creation,
        list(models) or None, list(tools) or None, tool_count,
    )

    return session_row, message_rows, tool_rows, errors


def load_project_sessions(con: duckdb.DuckDBPyConnection):
    """Load all project session JSONL files (rich format, Mar 2026+)."""
    projects_dir = CLAUDE_DIR / "projects"
    if not projects_dir.exists():
        print("  No projects directory found")
        return

    session_files = list(projects_dir.glob("*/*.jsonl"))
    print(f"  Found {len(session_files):,} project session files")

    session_rows = []
    message_rows = []
    tool_rows = []
    total_errors = 0

    for i, fpath in enumerate(session_files):
        if (i + 1) % 200 == 0:
            print(f"  Processing {i + 1}/{len(session_files)}...")

        project_dir = fpath.parent.name
        project_name = extract_project_name(project_dir)

        session_row, msgs, tools, errors = process_project_session(
            fpath, project_dir, project_name
        )
        total_errors += errors

        if session_row:
            session_rows.append(session_row)
        message_rows.extend(msgs)
        tool_rows.extend(tools)

    if session_rows:
        con.executemany(
            "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            session_rows,
        )
    if message_rows:
        con.executemany(
            "INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            message_rows,
        )
    if tool_rows:
        con.executemany(
            "INSERT INTO tool_calls VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            tool_rows,
        )

    print(f"  Loaded {len(session_rows):,} sessions, {len(message_rows):,} messages, {len(tool_rows):,} tool calls")
    if total_errors:
        print(f"  ({total_errors} parse errors skipped)")


def load_transcripts(con: duckdb.DuckDBPyConnection):
    """Load transcript JSONL files (lightweight format, Jan-Mar 2026)."""
    transcripts_dir = CLAUDE_DIR / "transcripts"
    if not transcripts_dir.exists():
        print("  No transcripts directory found, skipping")
        return

    transcript_files = list(transcripts_dir.glob("*.jsonl"))
    print(f"  Found {len(transcript_files):,} transcript files")

    session_rows = []
    message_rows = []
    tool_rows = []
    errors = 0

    for fpath in transcript_files:
        # Session ID from filename: ses_<ID>.jsonl -> ses_<ID>
        session_id = fpath.stem
        file_size_mb = fpath.stat().st_size / (1024 * 1024)

        lines = []
        try:
            with open(fpath) as f:
                for line in f:
                    try:
                        lines.append(json.loads(line.strip()))
                    except json.JSONDecodeError:
                        errors += 1
        except Exception:
            errors += 1
            continue

        if not lines:
            continue

        first_ts = None
        last_ts = None
        user_count = 0
        assistant_count = 0
        tools = set()
        tool_count = 0

        for msg in lines:
            msg_type = msg.get("type")
            ts = parse_timestamp(msg.get("timestamp"))

            if ts:
                if first_ts is None or ts < first_ts:
                    first_ts = ts
                if last_ts is None or ts > last_ts:
                    last_ts = ts

            if msg_type == "user":
                user_count += 1
                content = msg.get("content", "")
                if isinstance(content, str):
                    content = content[:2000]
                else:
                    content = str(content)[:2000]

                message_rows.append((
                    session_id, "transcripts", None, None,
                    "user", ts, None,
                    0, 0, 0, 0,
                    content, len(content),
                    None, None, None, None,
                ))

            elif msg_type == "tool_use":
                tool_name = msg.get("tool_name", "unknown")
                # Normalize tool names: transcripts use lowercase
                tool_name_normalized = {
                    "bash": "Bash", "read": "Read", "edit": "Edit",
                    "write": "Write", "grep": "Grep", "glob": "Glob",
                    "agent": "Agent", "web_search": "WebSearch",
                    "web_fetch": "WebFetch",
                }.get(tool_name, tool_name)

                tools.add(tool_name_normalized)
                tool_count += 1
                tool_rows.append((
                    session_id, "transcripts", None, ts, None,
                    tool_name_normalized, None, 0, 0,
                ))

            elif msg_type == "tool_result":
                # tool_result also has tool_name — count as part of the same call
                pass

            elif msg_type == "assistant":
                assistant_count += 1
                content = msg.get("content", "")
                if isinstance(content, list):
                    text_parts = [b.get("text", "") for b in content
                                  if isinstance(b, dict) and b.get("type") == "text"]
                    content = "\n".join(text_parts)[:2000]
                elif isinstance(content, str):
                    content = content[:2000]
                else:
                    content = ""

                message_rows.append((
                    session_id, "transcripts", None, None,
                    "assistant", ts, None,
                    0, 0, 0, 0,
                    content or None, len(content) if content else 0,
                    None, None, None, None,
                ))

        duration = None
        if first_ts and last_ts:
            duration = (last_ts - first_ts).total_seconds() / 60.0

        session_rows.append((
            session_id, "transcripts", None, None, str(fpath), file_size_mb,
            first_ts, last_ts, duration, None, None,
            len(lines), user_count, assistant_count,
            0, 0, 0, 0,  # no token data in transcripts
            None, list(tools) or None, tool_count,
        ))

    if session_rows:
        con.executemany(
            "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            session_rows,
        )
    if message_rows:
        con.executemany(
            "INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            message_rows,
        )
    if tool_rows:
        con.executemany(
            "INSERT INTO tool_calls VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            tool_rows,
        )

    print(f"  Loaded {len(session_rows):,} transcript sessions, {len(message_rows):,} messages, {len(tool_rows):,} tool calls")
    if errors:
        print(f"  ({errors} parse errors skipped)")


def main():
    print(f"Creating DuckDB at {DB_PATH}")
    # Remove existing db and WAL
    for p in [DB_PATH, Path(str(DB_PATH) + ".wal")]:
        if p.exists():
            p.unlink()

    con = duckdb.connect(str(DB_PATH))
    con.execute("SET memory_limit = '2GB'")

    print("Creating tables...")
    create_tables(con)

    print("\n[1/4] Loading history...")
    load_history(con)

    print("\n[2/4] Loading project sessions...")
    load_project_sessions(con)

    print("\n[3/4] Loading transcripts...")
    load_transcripts(con)

    print("\n[4/4] Loading session metadata...")
    load_session_metadata(con)

    # Print summary
    print("\n" + "=" * 50)
    print("  Summary")
    print("=" * 50)
    for table in ["history", "sessions", "messages", "tool_calls", "session_metadata"]:
        count = con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count:,} rows")

    # Source breakdown
    print("\n  Sessions by source:")
    rows = con.execute("""
        SELECT source, count(*), min(first_ts)::DATE, max(last_ts)::DATE
        FROM sessions GROUP BY source ORDER BY min(first_ts)
    """).fetchall()
    for src, cnt, earliest, latest in rows:
        print(f"    {src}: {cnt:,} sessions ({earliest} → {latest})")

    # Date range
    r = con.execute("SELECT min(first_ts)::DATE, max(last_ts)::DATE FROM sessions").fetchone()
    print(f"\n  Total date range: {r[0]} → {r[1]}")

    con.execute("CHECKPOINT")
    con.close()
    print(f"\nDone! Database saved to {DB_PATH}")


if __name__ == "__main__":
    main()
