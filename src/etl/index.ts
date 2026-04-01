/**
 * ETL orchestrator: create events table and run all loaders.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { createTables } from "./tables.js";
import { loadHistory } from "./history.js";
import { loadProjectSessions } from "./projects.js";
import { loadTranscripts } from "./transcripts.js";
import { runQuery } from "../db.js";

export interface LoadSummary {
  history: number;
  sessions: number;
  messages: number;
  toolCalls: number;
}

export async function loadAll(conn: DuckDBConnection): Promise<LoadSummary> {
  console.log("Creating table...");
  await createTables(conn);

  console.log("\n[1/3] Loading history...");
  const history = await loadHistory(conn);

  console.log("\n[2/3] Loading project sessions...");
  const projects = await loadProjectSessions(conn);

  console.log("\n[3/3] Loading transcripts...");
  const transcripts = await loadTranscripts(conn);

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("  Summary");
  console.log("=".repeat(50));

  const types = ["session", "message", "tool_call", "history"];
  for (const t of types) {
    const result = await runQuery(conn, `SELECT count(*) FROM events WHERE type='${t}'`);
    const count = Number(result.rows[0]?.[0] ?? 0);
    console.log(`  ${t}: ${count.toLocaleString()} rows`);
  }

  const totalResult = await runQuery(conn, "SELECT count(*) FROM events");
  console.log(`  total: ${Number(totalResult.rows[0]?.[0] ?? 0).toLocaleString()} rows`);

  // Source breakdown
  console.log("\n  Sessions by source:");
  const sourceResult = await runQuery(
    conn,
    `SELECT source, count(*), min(first_ts)::DATE, max(last_ts)::DATE
     FROM events WHERE type='session' GROUP BY source ORDER BY min(first_ts)`,
  );
  for (const row of sourceResult.rows) {
    console.log(`    ${row[0]}: ${Number(row[1]).toLocaleString()} sessions (${row[2]} → ${row[3]})`);
  }

  // Date range
  const rangeResult = await runQuery(
    conn,
    "SELECT min(first_ts)::DATE, max(last_ts)::DATE FROM events WHERE type='session'",
  );
  if (rangeResult.rows.length > 0) {
    console.log(`\n  Total date range: ${rangeResult.rows[0][0]} → ${rangeResult.rows[0][1]}`);
  }

  return {
    history,
    sessions: projects.sessions + transcripts.sessions,
    messages: projects.messages + transcripts.messages,
    toolCalls: projects.toolCalls + transcripts.toolCalls,
  };
}
