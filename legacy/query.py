#!/usr/bin/env python3
"""Run analytics queries against the ClauDuck database.

Usage:
    uv run python query.py                    # all time
    uv run python query.py --since 2026-03-01 # from date
    uv run python query.py --since 2026-03-01 --until 2026-03-31
    uv run python query.py --last 7d          # last 7 days
    uv run python query.py --last 4w          # last 4 weeks
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
import duckdb

DB_PATH = Path(__file__).parent / "clauduck.db"


def run_query(con, title: str, sql: str):
    """Run a query and print results."""
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}")
    try:
        result = con.execute(sql)
        cols = [desc[0] for desc in result.description]
        rows = result.fetchall()
        if not rows:
            print("  (no results)")
            return

        # Calculate column widths
        widths = [len(c) for c in cols]
        str_rows = []
        for row in rows:
            str_row = []
            for i, val in enumerate(row):
                s = str(val) if val is not None else ""
                if len(s) > 60:
                    s = s[:57] + "..."
                str_row.append(s)
                widths[i] = max(widths[i], len(s))
            str_rows.append(str_row)

        # Print header
        header = " | ".join(c.ljust(widths[i]) for i, c in enumerate(cols))
        print(header)
        print("-+-".join("-" * w for w in widths))

        # Print rows
        for row in str_rows:
            print(" | ".join(row[i].ljust(widths[i]) for i in range(len(cols))))

        print(f"\n({len(rows)} rows)")
    except Exception as e:
        print(f"  ERROR: {e}")


def parse_last(value: str) -> datetime:
    """Parse --last value like '7d', '4w', '2m' into a datetime."""
    unit = value[-1].lower()
    num = int(value[:-1])
    now = datetime.now()
    if unit == "d":
        return now - timedelta(days=num)
    elif unit == "w":
        return now - timedelta(weeks=num)
    elif unit == "m":
        return now - timedelta(days=num * 30)
    else:
        raise ValueError(f"Unknown unit '{unit}' in --last {value}. Use d/w/m.")


def main():
    parser = argparse.ArgumentParser(description="ClauDuck analytics queries")
    parser.add_argument("--since", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--until", help="End date (YYYY-MM-DD)")
    parser.add_argument("--last", help="Relative range: 7d, 4w, 2m")
    parser.add_argument("--source", help="Filter by source: projects, transcripts, or all (default: all)")
    args = parser.parse_args()

    con = duckdb.connect(str(DB_PATH), read_only=True)

    # Build filters
    date_filter_sessions = ""
    date_filter_messages = ""
    date_filter_tools = ""
    date_filter_history = ""
    period_label = "all time"

    # Source filter
    if args.source and args.source != "all":
        date_filter_sessions += f"AND source = '{args.source}'"
        date_filter_messages += f"AND source = '{args.source}'"
        date_filter_tools += f"AND source = '{args.source}'"
        period_label += f" ({args.source} only)"

    if args.last:
        since_dt = parse_last(args.last)
        since_str = since_dt.strftime("%Y-%m-%d")
        date_filter_sessions = f"AND first_ts >= '{since_str}'"
        date_filter_messages = f"AND timestamp >= '{since_str}'"
        date_filter_tools = f"AND timestamp >= '{since_str}'"
        date_filter_history = f"AND ts >= '{since_str}'"
        period_label = f"last {args.last}"
    else:
        if args.since:
            date_filter_sessions += f"AND first_ts >= '{args.since}'"
            date_filter_messages += f"AND timestamp >= '{args.since}'"
            date_filter_tools += f"AND timestamp >= '{args.since}'"
            date_filter_history += f"AND ts >= '{args.since}'"
            period_label = f"from {args.since}"
        if args.until:
            date_filter_sessions += f" AND first_ts <= '{args.until}'"
            date_filter_messages += f" AND timestamp <= '{args.until}'"
            date_filter_tools += f" AND timestamp <= '{args.until}'"
            date_filter_history += f" AND ts <= '{args.until}'"
            period_label += f" to {args.until}" if args.since else f"until {args.until}"

    sf = date_filter_sessions  # short aliases
    mf = date_filter_messages
    tf = date_filter_tools
    hf = date_filter_history

    print(f"\n  Period: {period_label}\n")

    run_query(con, "1. OVERVIEW", f"""
        SELECT
            count(DISTINCT session_id) as total_sessions,
            count(DISTINCT project_name) as total_projects,
            sum(user_messages) as user_msgs,
            sum(assistant_messages) as assistant_msgs,
            sum(tool_call_count) as tool_calls,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
            round(sum(duration_minutes) / 60, 1) as total_hours,
            min(first_ts)::DATE as earliest,
            max(last_ts)::DATE as latest
        FROM sessions
        WHERE 1=1 {sf}
    """)

    run_query(con, "1b. DATA SOURCES", f"""
        SELECT
            source,
            count(*) as sessions,
            sum(user_messages) as user_msgs,
            sum(tool_call_count) as tool_calls,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
            min(first_ts)::DATE as earliest,
            max(last_ts)::DATE as latest
        FROM sessions
        WHERE 1=1 {sf}
        GROUP BY 1
        ORDER BY earliest
    """)

    run_query(con, "2. DAILY ACTIVITY", f"""
        SELECT
            date_trunc('day', first_ts)::DATE as day,
            count(*) as sessions,
            sum(user_messages + assistant_messages) as messages,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            round(sum(duration_minutes), 0) as total_min
        FROM sessions
        WHERE first_ts IS NOT NULL {sf}
        GROUP BY 1
        ORDER BY 1 DESC
    """)

    run_query(con, "3. TOP PROJECTS BY TOKEN USAGE", f"""
        SELECT
            project_name,
            count(*) as sessions,
            sum(tool_call_count) as tool_calls,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
            round(sum(duration_minutes) / 60, 1) as hours
        FROM sessions
        WHERE 1=1 {sf}
        GROUP BY 1
        ORDER BY tokens_M DESC
        LIMIT 20
    """)

    run_query(con, "4. TOOL USAGE RANKING", f"""
        SELECT
            tool_name,
            count(*) as calls,
            count(DISTINCT session_id) as sessions,
            count(DISTINCT project_name) as projects
        FROM tool_calls
        WHERE 1=1 {tf}
        GROUP BY 1
        ORDER BY calls DESC
        LIMIT 25
    """)

    run_query(con, "5. MODEL USAGE & ESTIMATED COST", f"""
        SELECT
            model,
            count(*) as msgs,
            round(sum(input_tokens) / 1e6, 2) as input_M,
            round(sum(output_tokens) / 1e6, 2) as output_M,
            round(sum(cache_read_tokens) / 1e6, 2) as cache_M,
            round(
                CASE
                    WHEN model LIKE '%haiku%' THEN sum(input_tokens)*0.25/1e6 + sum(output_tokens)*1.25/1e6
                    WHEN model LIKE '%sonnet%' THEN sum(input_tokens)*3.0/1e6 + sum(output_tokens)*15.0/1e6
                    WHEN model LIKE '%opus%' THEN sum(input_tokens)*15.0/1e6 + sum(output_tokens)*75.0/1e6
                    ELSE sum(input_tokens)*3.0/1e6 + sum(output_tokens)*15.0/1e6
                END, 2
            ) as est_cost_usd
        FROM messages
        WHERE model IS NOT NULL AND model != '' {mf}
        GROUP BY 1
        ORDER BY est_cost_usd DESC
    """)

    run_query(con, "6. HOURLY ACTIVITY PATTERN", f"""
        SELECT
            extract(hour FROM timestamp)::INT as hour,
            count(*) as messages,
            count(DISTINCT session_id) as sessions,
            round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
        FROM messages
        WHERE timestamp IS NOT NULL {mf}
        GROUP BY 1
        ORDER BY 1
    """)

    run_query(con, "7. DAY OF WEEK ACTIVITY", f"""
        SELECT
            dayname(timestamp) as day,
            extract(isodow FROM timestamp)::INT as dow,
            count(*) as messages,
            count(DISTINCT session_id) as sessions,
            round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
        FROM messages
        WHERE timestamp IS NOT NULL {mf}
        GROUP BY 1, 2
        ORDER BY 2
    """)

    run_query(con, "8. LONGEST SESSIONS", f"""
        SELECT
            project_name,
            round(duration_minutes, 0) as minutes,
            user_messages as user_msgs,
            tool_call_count as tools,
            round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            first_ts::DATE as date
        FROM sessions
        WHERE duration_minutes IS NOT NULL {sf}
        ORDER BY duration_minutes DESC
        LIMIT 10
    """)

    run_query(con, "9. MOST TOKEN-HEAVY SESSIONS", f"""
        SELECT
            project_name,
            round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            total_output_tokens as output_tok,
            round(duration_minutes, 0) as minutes,
            tool_call_count as tools,
            first_ts::DATE as date
        FROM sessions
        WHERE 1=1 {sf}
        ORDER BY (total_input_tokens + total_output_tokens) DESC
        LIMIT 10
    """)

    run_query(con, "10. CACHE EFFICIENCY BY PROJECT", f"""
        SELECT
            project_name,
            count(*) as sessions,
            round(sum(total_cache_read_tokens) / 1e6, 2) as cache_read_M,
            round(sum(total_input_tokens) / 1e6, 2) as input_M,
            CASE
                WHEN sum(total_input_tokens) > 0
                THEN round(100.0 * sum(total_cache_read_tokens) / sum(total_input_tokens), 1)
                ELSE 0
            END as cache_pct
        FROM sessions
        WHERE total_input_tokens > 0 {sf}
        GROUP BY 1
        ORDER BY cache_read_M DESC
        LIMIT 20
    """)

    run_query(con, "11. SESSION COMPLEXITY DISTRIBUTION", f"""
        SELECT
            CASE
                WHEN user_messages <= 5 THEN '1-5 msgs'
                WHEN user_messages <= 15 THEN '6-15 msgs'
                WHEN user_messages <= 30 THEN '16-30 msgs'
                WHEN user_messages <= 60 THEN '31-60 msgs'
                ELSE '60+ msgs'
            END as bucket,
            count(*) as sessions,
            round(avg(duration_minutes), 0) as avg_min,
            round(avg(tool_call_count), 0) as avg_tools,
            round(avg(total_input_tokens + total_output_tokens) / 1e6, 2) as avg_tokens_M
        FROM sessions
        WHERE user_messages > 0 {sf}
        GROUP BY 1
        ORDER BY min(user_messages)
    """)

    run_query(con, "12. WEEKLY TRENDS", f"""
        SELECT
            date_trunc('week', first_ts)::DATE as week,
            count(*) as sessions,
            sum(user_messages + assistant_messages) as messages,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
            round(sum(duration_minutes) / 60, 1) as hours,
            sum(tool_call_count) as tools
        FROM sessions
        WHERE first_ts IS NOT NULL {sf}
        GROUP BY 1
        ORDER BY 1 DESC
    """)

    run_query(con, "13. GIT BRANCH ACTIVITY", f"""
        SELECT
            git_branch,
            count(*) as sessions,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            round(sum(duration_minutes) / 60, 1) as hours
        FROM sessions
        WHERE git_branch IS NOT NULL AND git_branch != '' {sf}
        GROUP BY 1
        ORDER BY tokens_M DESC
        LIMIT 20
    """)

    run_query(con, "14. VERSION HISTORY", f"""
        SELECT
            version,
            count(*) as sessions,
            min(first_ts)::DATE as first_seen,
            max(last_ts)::DATE as last_seen
        FROM sessions
        WHERE version IS NOT NULL {sf}
        GROUP BY 1
        ORDER BY first_seen DESC
    """)

    run_query(con, "15. MOST REPEATED PROMPTS", f"""
        SELECT
            left(display, 80) as prompt,
            count(*) as times,
            count(DISTINCT project) as projects
        FROM history
        WHERE length(display) > 5 {hf}
        GROUP BY display
        HAVING count(*) > 2
        ORDER BY times DESC
        LIMIT 20
    """)

    con.close()
    print(f"\n{'=' * 70}")
    print("  Database: clauduck.db")
    print("  Interactive: uv run python -c \"import duckdb; con=duckdb.connect('clauduck.db'); print(con.sql('SELECT * FROM sessions LIMIT 5'))\"")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
