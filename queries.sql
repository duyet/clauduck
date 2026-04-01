-- ============================================================
-- ClaudeDuck: Claude Code Session Analytics
-- Run: duckdb claudeduck.db < queries.sql
-- Or open interactive: duckdb claudeduck.db
-- ============================================================

-- 1. Overview
SELECT
    count(DISTINCT session_id) as total_sessions,
    count(DISTINCT project_name) as total_projects,
    sum(user_messages) as total_user_msgs,
    sum(assistant_messages) as total_assistant_msgs,
    sum(tool_call_count) as total_tool_calls,
    round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as total_tokens_M,
    round(sum(duration_minutes) / 60, 1) as total_hours,
    min(first_ts) as earliest_session,
    max(last_ts) as latest_session
FROM sessions;

-- 2. Daily activity (sessions, messages, tokens)
SELECT
    date_trunc('day', first_ts)::DATE as day,
    count(*) as sessions,
    sum(user_messages + assistant_messages) as messages,
    round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
    round(sum(duration_minutes), 0) as total_minutes
FROM sessions
WHERE first_ts IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;

-- 3. Top projects by usage
SELECT
    project_name,
    count(*) as sessions,
    sum(user_messages) as user_msgs,
    sum(assistant_messages) as assistant_msgs,
    sum(tool_call_count) as tool_calls,
    round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
    round(sum(duration_minutes) / 60, 1) as hours,
    round(sum(file_size_mb), 1) as data_mb
FROM sessions
GROUP BY 1
ORDER BY tokens_M DESC
LIMIT 20;

-- 4. Model usage breakdown
SELECT
    unnest(models_used) as model,
    count(*) as session_count,
    round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M
FROM sessions
WHERE models_used IS NOT NULL
GROUP BY 1
ORDER BY tokens_M DESC;

-- 5. Tool usage ranking
SELECT
    tool_name,
    count(*) as call_count,
    count(DISTINCT session_id) as sessions_used_in,
    count(DISTINCT project_name) as projects_used_in
FROM tool_calls
GROUP BY 1
ORDER BY call_count DESC
LIMIT 30;

-- 6. Estimated cost (approximate pricing)
-- Haiku: $0.25/$1.25 per 1M input/output
-- Sonnet: $3/$15 per 1M input/output
-- Opus: $15/$75 per 1M input/output
SELECT
    model,
    count(*) as messages,
    round(sum(input_tokens) / 1e6, 3) as input_M,
    round(sum(output_tokens) / 1e6, 3) as output_M,
    round(sum(cache_read_tokens) / 1e6, 3) as cache_read_M,
    round(
        CASE
            WHEN model LIKE '%haiku%' THEN
                sum(input_tokens) * 0.25 / 1e6 + sum(output_tokens) * 1.25 / 1e6
            WHEN model LIKE '%sonnet%' THEN
                sum(input_tokens) * 3.0 / 1e6 + sum(output_tokens) * 15.0 / 1e6
            WHEN model LIKE '%opus%' THEN
                sum(input_tokens) * 15.0 / 1e6 + sum(output_tokens) * 75.0 / 1e6
            ELSE
                sum(input_tokens) * 3.0 / 1e6 + sum(output_tokens) * 15.0 / 1e6
        END, 2
    ) as estimated_cost_usd
FROM messages
WHERE model IS NOT NULL AND model != ''
GROUP BY 1
ORDER BY estimated_cost_usd DESC;

-- 7. Longest sessions
SELECT
    session_id,
    project_name,
    round(duration_minutes, 0) as minutes,
    user_messages,
    assistant_messages,
    tool_call_count,
    round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
    first_ts::DATE as date
FROM sessions
WHERE duration_minutes IS NOT NULL
ORDER BY duration_minutes DESC
LIMIT 15;

-- 8. Most token-heavy sessions
SELECT
    session_id,
    project_name,
    round((total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
    total_input_tokens as input_tokens,
    total_output_tokens as output_tokens,
    round(duration_minutes, 0) as minutes,
    tool_call_count,
    first_ts::DATE as date
FROM sessions
ORDER BY (total_input_tokens + total_output_tokens) DESC
LIMIT 15;

-- 9. Cache efficiency
SELECT
    project_name,
    count(*) as sessions,
    round(sum(total_cache_read_tokens) / 1e6, 2) as cache_read_M,
    round(sum(total_cache_creation_tokens) / 1e6, 2) as cache_create_M,
    round(sum(total_input_tokens) / 1e6, 2) as input_M,
    CASE
        WHEN sum(total_input_tokens) > 0
        THEN round(100.0 * sum(total_cache_read_tokens) / sum(total_input_tokens), 1)
        ELSE 0
    END as cache_hit_pct
FROM sessions
WHERE total_input_tokens > 0
GROUP BY 1
ORDER BY cache_read_M DESC
LIMIT 20;

-- 10. Hourly activity pattern (what hours do you code?)
SELECT
    extract(hour FROM timestamp) as hour,
    count(*) as messages,
    count(DISTINCT session_id) as sessions,
    round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
FROM messages
WHERE timestamp IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- 11. Day of week activity
SELECT
    dayname(timestamp) as day_of_week,
    extract(isodow FROM timestamp) as dow_num,
    count(*) as messages,
    count(DISTINCT session_id) as sessions,
    round(sum(input_tokens + output_tokens) / 1e6, 2) as tokens_M
FROM messages
WHERE timestamp IS NOT NULL
GROUP BY 1, 2
ORDER BY 2;

-- 12. Tool usage by project
SELECT
    project_name,
    tool_name,
    count(*) as calls
FROM tool_calls
GROUP BY 1, 2
ORDER BY 1, calls DESC;

-- 13. Session complexity (messages per session distribution)
SELECT
    CASE
        WHEN user_messages <= 5 THEN '1-5 msgs'
        WHEN user_messages <= 15 THEN '6-15 msgs'
        WHEN user_messages <= 30 THEN '16-30 msgs'
        WHEN user_messages <= 60 THEN '31-60 msgs'
        ELSE '60+ msgs'
    END as complexity_bucket,
    count(*) as session_count,
    round(avg(duration_minutes), 0) as avg_duration_min,
    round(avg(tool_call_count), 0) as avg_tool_calls,
    round(avg(total_input_tokens + total_output_tokens) / 1e6, 2) as avg_tokens_M
FROM sessions
WHERE user_messages > 0
GROUP BY 1
ORDER BY min(user_messages);

-- 14. Git branch activity
SELECT
    git_branch,
    count(*) as sessions,
    sum(user_messages) as user_msgs,
    round(sum(total_input_tokens + total_output_tokens) / 1e6, 2) as tokens_M,
    round(sum(duration_minutes) / 60, 1) as hours
FROM sessions
WHERE git_branch IS NOT NULL AND git_branch != ''
GROUP BY 1
ORDER BY tokens_M DESC
LIMIT 20;

-- 15. Version usage over time
SELECT
    version,
    count(*) as sessions,
    min(first_ts)::DATE as first_seen,
    max(last_ts)::DATE as last_seen
FROM sessions
WHERE version IS NOT NULL
GROUP BY 1
ORDER BY first_seen DESC;

-- 16. History: most common prompts (deduplicated)
SELECT
    display,
    count(*) as times_used,
    count(DISTINCT project) as projects
FROM history
WHERE length(display) > 5
GROUP BY 1
HAVING count(*) > 1
ORDER BY times_used DESC
LIMIT 20;

-- 17. Weekly trends
SELECT
    date_trunc('week', first_ts)::DATE as week,
    count(*) as sessions,
    sum(user_messages + assistant_messages) as messages,
    round(sum(total_input_tokens + total_output_tokens) / 1e6, 1) as tokens_M,
    round(sum(duration_minutes) / 60, 1) as hours,
    sum(tool_call_count) as tool_calls
FROM sessions
WHERE first_ts IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC
LIMIT 20;

-- 18. Token efficiency: output per input ratio
SELECT
    project_name,
    count(*) as sessions,
    round(sum(total_input_tokens) / 1e6, 2) as input_M,
    round(sum(total_output_tokens) / 1e6, 2) as output_M,
    round(1.0 * sum(total_output_tokens) / nullif(sum(total_input_tokens), 0), 3) as output_input_ratio
FROM sessions
WHERE total_input_tokens > 0
GROUP BY 1
ORDER BY input_M DESC
LIMIT 20;
