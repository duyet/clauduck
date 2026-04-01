#!/usr/bin/env python3
"""Load Claude Code session data into DuckDB for analysis."""

import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime, timezone

import duckdb

CLAUDE_DIR = Path.home() / ".claude"
DB_PATH = Path(__file__).parent / "clauduck.db"


def create_tables(con: duckdb.DuckDBPyConnection):
    """Create tables for Claude Code analytics."""

    # History: user prompts log
    con.execute("""
        CREATE OR REPLACE TABLE history (
            display VARCHAR,
            timestamp BIGINT,
            ts TIMESTAMP,
            project VARCHAR
        )
    """)

    # Sessions: metadata about each session
    con.execute("""
        CREATE OR REPLACE TABLE sessions (
            session_id VARCHAR,
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

    # Messages: individual messages from sessions
    con.execute("""
        CREATE OR REPLACE TABLE messages (
            session_id VARCHAR,
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

    # Tool usage: each tool call extracted
    con.execute("""
        CREATE OR REPLACE TABLE tool_calls (
            session_id VARCHAR,
            project_name VARCHAR,
            timestamp TIMESTAMP,
            model VARCHAR,
            tool_name VARCHAR,
            tool_use_id VARCHAR,
            input_tokens BIGINT,
            output_tokens BIGINT
        )
    """)


def load_history(con: duckdb.DuckDBPyConnection):
    """Load history.jsonl into DuckDB."""
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
                ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc) if ts_ms else None
                rows.append((
                    obj.get("display", ""),
                    ts_ms,
                    ts,
                    obj.get("project", ""),
                ))
            except (json.JSONDecodeError, Exception):
                continue

    if rows:
        con.executemany("INSERT INTO history VALUES (?, ?, ?, ?)", rows)
    print(f"  Loaded {len(rows):,} history entries")


def extract_project_name(dir_name: str) -> str:
    """Extract human-readable project name from directory hash."""
    # e.g. "-Users-duet-project-monorepo" -> "monorepo"
    parts = dir_name.replace("-", "/").strip("/").split("/")
    # Find last meaningful segment
    if "project" in parts:
        idx = parts.index("project")
        return "/".join(parts[idx + 1:]) if idx + 1 < len(parts) else parts[-1]
    return parts[-1] if parts else dir_name


def load_sessions(con: duckdb.DuckDBPyConnection):
    """Load all project session JSONL files."""
    projects_dir = CLAUDE_DIR / "projects"
    if not projects_dir.exists():
        print("  No projects directory found")
        return

    session_files = list(projects_dir.glob("*/*.jsonl"))
    print(f"  Found {len(session_files):,} session files")

    session_rows = []
    message_rows = []
    tool_rows = []
    errors = 0

    for i, fpath in enumerate(session_files):
        if (i + 1) % 100 == 0:
            print(f"  Processing {i + 1}/{len(session_files)}...")

        project_dir = fpath.parent.name
        project_name = extract_project_name(project_dir)
        session_id = fpath.stem
        file_size_mb = fpath.stat().st_size / (1024 * 1024)

        # Parse all messages in the session
        messages = []
        try:
            with open(fpath) as f:
                for line in f:
                    try:
                        obj = json.loads(line.strip())
                        messages.append(obj)
                    except json.JSONDecodeError:
                        errors += 1
        except Exception:
            errors += 1
            continue

        if not messages:
            continue

        # Aggregate session stats
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

        for msg in messages:
            msg_type = msg.get("type")
            ts_str = msg.get("timestamp")

            # Parse timestamp
            ts = None
            if isinstance(ts_str, str):
                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass
            elif isinstance(ts_str, (int, float)):
                try:
                    ts = datetime.fromtimestamp(ts_str / 1000, tz=timezone.utc)
                except (ValueError, OSError):
                    pass

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

            # Extract usage from assistant messages
            api_msg = msg.get("message", {})
            if isinstance(api_msg, dict):
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

                # Extract tool calls from content
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
                                session_id,
                                project_name,
                                ts,
                                model,
                                tool_name,
                                block.get("id", ""),
                                input_t,
                                output_t,
                            ))

                # Extract text content for message row
                text_content = ""
                if isinstance(content, list):
                    text_parts = [b.get("text", "") for b in content
                                  if isinstance(b, dict) and b.get("type") == "text"]
                    text_content = "\n".join(text_parts)[:2000]  # truncate
                elif isinstance(content, str):
                    text_content = content[:2000]

                if msg_type in ("user", "assistant"):
                    # For user messages, content might be in message.content directly
                    if msg_type == "user" and not text_content:
                        raw_content = api_msg.get("content", "")
                        if isinstance(raw_content, str):
                            text_content = raw_content[:2000]

                    message_rows.append((
                        session_id,
                        project_name,
                        msg.get("uuid", ""),
                        msg_type,
                        ts,
                        model or None,
                        input_t,
                        output_t,
                        cache_read,
                        cache_create,
                        text_content or None,
                        len(text_content) if text_content else 0,
                        msg_tools or None,
                        msg.get("gitBranch"),
                        msg.get("version"),
                        msg.get("cwd"),
                    ))

        # Compute duration
        duration = None
        if first_ts and last_ts:
            duration = (last_ts - first_ts).total_seconds() / 60.0

        session_rows.append((
            session_id,
            project_dir,
            project_name,
            str(fpath),
            file_size_mb,
            first_ts,
            last_ts,
            duration,
            version,
            git_branch,
            len(messages),
            user_count,
            assistant_count,
            total_input,
            total_output,
            total_cache_read,
            total_cache_creation,
            list(models) or None,
            list(tools) or None,
            tool_count,
        ))

    # Bulk insert
    if session_rows:
        con.executemany("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", session_rows)
    if message_rows:
        con.executemany("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", message_rows)
    if tool_rows:
        con.executemany("INSERT INTO tool_calls VALUES (?, ?, ?, ?, ?, ?, ?, ?)", tool_rows)

    print(f"  Loaded {len(session_rows):,} sessions, {len(message_rows):,} messages, {len(tool_rows):,} tool calls")
    if errors:
        print(f"  ({errors} parse errors skipped)")


def main():
    print(f"Creating DuckDB at {DB_PATH}")
    if DB_PATH.exists():
        DB_PATH.unlink()

    con = duckdb.connect(str(DB_PATH))
    con.execute("SET memory_limit = '2GB'")

    print("Creating tables...")
    create_tables(con)

    print("Loading history...")
    load_history(con)

    print("Loading sessions...")
    load_sessions(con)

    # Print summary
    print("\n=== Summary ===")
    for table in ["history", "sessions", "messages", "tool_calls"]:
        count = con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count:,} rows")

    con.close()
    print(f"\nDone! Database saved to {DB_PATH}")
    print(f"Run queries with: duckdb {DB_PATH}")


if __name__ == "__main__":
    main()
