/**
 * All 15 analytics query definitions.
 * All queries target the single `events` table with type filters.
 */

import type { Filters } from "./filters.js";

export interface QueryDef {
  id: string;
  title: string;
  sql: (f: Filters) => string;
}

export const queries: QueryDef[] = [
  {
    id: "1",
    title: "OVERVIEW",
    sql: (f) => `
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
      FROM events
      WHERE type='session' ${f.sessions}
    `,
  },
  {
    id: "1b",
    title: "DATA SOURCES",
    sql: (f) => `
      SELECT
        source,
        count(*) as sessions,
        sum(user_messages) as user_msgs,
        sum(tool_call_count) as tool_calls,
        round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
        min(first_ts)::DATE as earliest,
        max(last_ts)::DATE as latest
      FROM events
      WHERE type='session' ${f.sessions}
      GROUP BY 1
      ORDER BY earliest
    `,
  },
  {
    id: "2",
    title: "DAILY ACTIVITY",
    sql: (f) => `
      SELECT
        date_trunc('day', first_ts)::DATE as day,
        count(*) as sessions,
        sum(user_messages + assistant_messages) as messages,
        round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
        round(sum(duration_minutes), 0) as total_min
      FROM events
      WHERE type='session' AND first_ts IS NOT NULL ${f.sessions}
      GROUP BY 1
      ORDER BY 1 DESC
    `,
  },
  {
    id: "3",
    title: "TOP PROJECTS BY TOKEN USAGE",
    sql: (f) => `
      SELECT
        project_name,
        count(*) as sessions,
        sum(tool_call_count) as tool_calls,
        round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
        round(sum(duration_minutes) / 60, 1) as hours
      FROM events
      WHERE type='session' ${f.sessions}
      GROUP BY 1
      ORDER BY tokens_M DESC
      LIMIT 20
    `,
  },
  {
    id: "4",
    title: "TOOL USAGE RANKING",
    sql: (f) => `
      SELECT
        tool_name,
        count(*) as calls,
        count(DISTINCT session_id) as sessions,
        count(DISTINCT project_name) as projects
      FROM events
      WHERE type='tool_call' ${f.events}
      GROUP BY 1
      ORDER BY calls DESC
      LIMIT 25
    `,
  },
  {
    id: "5",
    title: "MODEL USAGE & ESTIMATED COST",
    sql: (f) => `
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
      FROM events
      WHERE type='message' AND model IS NOT NULL AND model != '' ${f.events}
      GROUP BY 1
      ORDER BY est_cost_usd DESC
    `,
  },
  {
    id: "6",
    title: "HOURLY ACTIVITY PATTERN",
    sql: (f) => `
      SELECT
        extract(hour FROM timestamp)::INT as hour,
        count(*) as messages,
        count(DISTINCT session_id) as sessions,
        round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
      FROM events
      WHERE type='message' AND timestamp IS NOT NULL ${f.events}
      GROUP BY 1
      ORDER BY 1
    `,
  },
  {
    id: "7",
    title: "DAY OF WEEK ACTIVITY",
    sql: (f) => `
      SELECT
        dayname(timestamp) as day,
        extract(isodow FROM timestamp)::INT as dow,
        count(*) as messages,
        count(DISTINCT session_id) as sessions,
        round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
      FROM events
      WHERE type='message' AND timestamp IS NOT NULL ${f.events}
      GROUP BY 1, 2
      ORDER BY 2
    `,
  },
  {
    id: "8",
    title: "LONGEST SESSIONS",
    sql: (f) => `
      SELECT
        project_name,
        round(duration_minutes, 0) as minutes,
        user_messages as user_msgs,
        tool_call_count as tools,
        round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
        first_ts::DATE as date
      FROM events
      WHERE type='session' AND duration_minutes IS NOT NULL ${f.sessions}
      ORDER BY duration_minutes DESC
      LIMIT 10
    `,
  },
  {
    id: "9",
    title: "MOST TOKEN-HEAVY SESSIONS",
    sql: (f) => `
      SELECT
        project_name,
        round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
        total_output_tokens as output_tok,
        round(duration_minutes, 0) as minutes,
        tool_call_count as tools,
        first_ts::DATE as date
      FROM events
      WHERE type='session' ${f.sessions}
      ORDER BY (total_input_tokens + total_output_tokens) DESC
      LIMIT 10
    `,
  },
  {
    id: "10",
    title: "CACHE EFFICIENCY BY PROJECT",
    sql: (f) => `
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
      FROM events
      WHERE type='session' AND total_input_tokens > 0 ${f.sessions}
      GROUP BY 1
      ORDER BY cache_read_M DESC
      LIMIT 20
    `,
  },
  {
    id: "11",
    title: "SESSION COMPLEXITY DISTRIBUTION",
    sql: (f) => `
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
      FROM events
      WHERE type='session' AND user_messages > 0 ${f.sessions}
      GROUP BY 1
      ORDER BY min(user_messages)
    `,
  },
  {
    id: "12",
    title: "WEEKLY TRENDS",
    sql: (f) => `
      SELECT
        date_trunc('week', first_ts)::DATE as week,
        count(*) as sessions,
        sum(user_messages + assistant_messages) as messages,
        round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
        round(sum(duration_minutes) / 60, 1) as hours,
        sum(tool_call_count) as tools
      FROM events
      WHERE type='session' AND first_ts IS NOT NULL ${f.sessions}
      GROUP BY 1
      ORDER BY 1 DESC
    `,
  },
  {
    id: "13",
    title: "GIT BRANCH ACTIVITY",
    sql: (f) => `
      SELECT
        git_branch,
        count(*) as sessions,
        round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
        round(sum(duration_minutes) / 60, 1) as hours
      FROM events
      WHERE type='session' AND git_branch IS NOT NULL AND git_branch != '' ${f.sessions}
      GROUP BY 1
      ORDER BY tokens_M DESC
      LIMIT 20
    `,
  },
  {
    id: "14",
    title: "VERSION HISTORY",
    sql: (f) => `
      SELECT
        version,
        count(*) as sessions,
        min(first_ts)::DATE as first_seen,
        max(last_ts)::DATE as last_seen
      FROM events
      WHERE type='session' AND version IS NOT NULL ${f.sessions}
      GROUP BY 1
      ORDER BY first_seen DESC
    `,
  },
  {
    id: "15",
    title: "MOST REPEATED PROMPTS",
    sql: (f) => `
      SELECT
        left(display, 80) as prompt,
        count(*) as times,
        count(DISTINCT project_name) as projects
      FROM events
      WHERE type='history' AND length(display) > 5 ${f.history}
      GROUP BY display
      HAVING count(*) > 2
      ORDER BY times DESC
      LIMIT 20
    `,
  },
];
