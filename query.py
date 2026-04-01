#!/usr/bin/env python3
"""Run analytics queries against the ClauDuck database."""

import sys
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


def main():
    con = duckdb.connect(str(DB_PATH), read_only=True)

    run_query(con, "1. OVERVIEW", """
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
    """)

    run_query(con, "2. DAILY ACTIVITY (last 14 days)", """
        SELECT
            date_trunc('day', first_ts)::DATE as day,
            count(*) as sessions,
            sum(user_messages + assistant_messages) as messages,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            round(sum(duration_minutes), 0) as total_min
        FROM sessions
        WHERE first_ts IS NOT NULL
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 14
    """)

    run_query(con, "3. TOP PROJECTS BY TOKEN USAGE", """
        SELECT
            project_name,
            count(*) as sessions,
            sum(tool_call_count) as tool_calls,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
            round(sum(duration_minutes) / 60, 1) as hours
        FROM sessions
        GROUP BY 1
        ORDER BY tokens_M DESC
        LIMIT 15
    """)

    run_query(con, "4. TOOL USAGE RANKING", """
        SELECT
            tool_name,
            count(*) as calls,
            count(DISTINCT session_id) as sessions,
            count(DISTINCT project_name) as projects
        FROM tool_calls
        GROUP BY 1
        ORDER BY calls DESC
        LIMIT 20
    """)

    run_query(con, "5. MODEL USAGE & ESTIMATED COST", """
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
        WHERE model IS NOT NULL AND model != ''
        GROUP BY 1
        ORDER BY est_cost_usd DESC
    """)

    run_query(con, "6. HOURLY ACTIVITY PATTERN", """
        SELECT
            extract(hour FROM timestamp)::INT as hour,
            count(*) as messages,
            count(DISTINCT session_id) as sessions,
            round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
        FROM messages
        WHERE timestamp IS NOT NULL
        GROUP BY 1
        ORDER BY 1
    """)

    run_query(con, "7. DAY OF WEEK ACTIVITY", """
        SELECT
            dayname(timestamp) as day,
            extract(isodow FROM timestamp)::INT as dow,
            count(*) as messages,
            count(DISTINCT session_id) as sessions,
            round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
        FROM messages
        WHERE timestamp IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 2
    """)

    run_query(con, "8. LONGEST SESSIONS", """
        SELECT
            project_name,
            round(duration_minutes, 0) as minutes,
            user_messages as user_msgs,
            tool_call_count as tools,
            round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            first_ts::DATE as date
        FROM sessions
        WHERE duration_minutes IS NOT NULL
        ORDER BY duration_minutes DESC
        LIMIT 10
    """)

    run_query(con, "9. MOST TOKEN-HEAVY SESSIONS", """
        SELECT
            project_name,
            round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            total_output_tokens as output_tok,
            round(duration_minutes, 0) as minutes,
            tool_call_count as tools,
            first_ts::DATE as date
        FROM sessions
        ORDER BY (total_input_tokens + total_output_tokens) DESC
        LIMIT 10
    """)

    run_query(con, "10. CACHE EFFICIENCY BY PROJECT", """
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
        WHERE total_input_tokens > 0
        GROUP BY 1
        ORDER BY cache_read_M DESC
        LIMIT 15
    """)

    run_query(con, "11. SESSION COMPLEXITY DISTRIBUTION", """
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
        WHERE user_messages > 0
        GROUP BY 1
        ORDER BY min(user_messages)
    """)

    run_query(con, "12. WEEKLY TRENDS", """
        SELECT
            date_trunc('week', first_ts)::DATE as week,
            count(*) as sessions,
            sum(user_messages + assistant_messages) as messages,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
            round(sum(duration_minutes) / 60, 1) as hours,
            sum(tool_call_count) as tools
        FROM sessions
        WHERE first_ts IS NOT NULL
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 15
    """)

    run_query(con, "13. GIT BRANCH ACTIVITY (top 15)", """
        SELECT
            git_branch,
            count(*) as sessions,
            round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
            round(sum(duration_minutes) / 60, 1) as hours
        FROM sessions
        WHERE git_branch IS NOT NULL AND git_branch != ''
        GROUP BY 1
        ORDER BY tokens_M DESC
        LIMIT 15
    """)

    run_query(con, "14. VERSION HISTORY", """
        SELECT
            version,
            count(*) as sessions,
            min(first_ts)::DATE as first_seen,
            max(last_ts)::DATE as last_seen
        FROM sessions
        WHERE version IS NOT NULL
        GROUP BY 1
        ORDER BY first_seen DESC
        LIMIT 15
    """)

    run_query(con, "15. MOST REPEATED PROMPTS", """
        SELECT
            left(display, 80) as prompt,
            count(*) as times,
            count(DISTINCT project) as projects
        FROM history
        WHERE length(display) > 5
        GROUP BY display
        HAVING count(*) > 2
        ORDER BY times DESC
        LIMIT 15
    """)

    con.close()
    print(f"\n{'=' * 70}")
    print("  Database: clauduck.db")
    print("  Interactive: uv run python -c \"import duckdb; con=duckdb.connect('clauduck.db'); print(con.sql('SELECT * FROM sessions LIMIT 5'))\"")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
