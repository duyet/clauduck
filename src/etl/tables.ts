/**
 * CREATE TABLE DDL for the single events table.
 */

import type { DuckDBConnection } from "@duckdb/node-api";

const DDL = `CREATE OR REPLACE TABLE events (
  -- Identity
  type VARCHAR,             -- 'session' | 'message' | 'tool_call' | 'history'
  session_id VARCHAR,
  source VARCHAR,           -- 'projects' | 'transcripts'

  -- Project context
  project_dir VARCHAR,
  project_name VARCHAR,

  -- Timestamps
  timestamp TIMESTAMP,      -- universal timestamp
  first_ts TIMESTAMP,       -- sessions: start time
  last_ts TIMESTAMP,        -- sessions: end time

  -- Session aggregates (type='session')
  file_path VARCHAR,
  file_size_mb DOUBLE,
  duration_minutes DOUBLE,
  message_count INTEGER,
  user_messages INTEGER,
  assistant_messages INTEGER,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cache_read_tokens BIGINT,
  total_cache_creation_tokens BIGINT,
  models_used VARCHAR[],
  tools_used VARCHAR[],
  tool_call_count INTEGER,

  -- Message fields (type='message')
  uuid VARCHAR,
  message_type VARCHAR,     -- 'user' | 'assistant'
  model VARCHAR,
  input_tokens BIGINT,
  output_tokens BIGINT,
  cache_read_tokens BIGINT,
  cache_creation_tokens BIGINT,
  content_text VARCHAR,
  content_length INTEGER,
  tool_names VARCHAR[],

  -- Tool call fields (type='tool_call')
  tool_name VARCHAR,
  tool_use_id VARCHAR,

  -- History fields (type='history')
  display VARCHAR,

  -- Shared metadata
  version VARCHAR,
  git_branch VARCHAR,
  cwd VARCHAR
)`;

export async function createTables(conn: DuckDBConnection): Promise<void> {
  await conn.run(DDL);
}
