/**
 * Load ~/.claude/history.jsonl into events table (type='history').
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseTimestamp, EVENT_TYPE } from "./parse.js";
import { batchInsertEvents } from "./insert.js";

const COLUMNS = ["type", "session_id", "timestamp", "display", "project_name"];

export async function loadHistory(conn: DuckDBConnection): Promise<number> {
  const historyFile = join(homedir(), ".claude", "history.jsonl");
  if (!existsSync(historyFile)) {
    console.log("  No history.jsonl found, skipping");
    return 0;
  }

  const rows: unknown[][] = [];
  const rl = createInterface({
    input: createReadStream(historyFile, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const ts = parseTimestamp(obj.timestamp);
      rows.push([
        EVENT_TYPE.HISTORY,
        obj.sessionId ?? null,
        ts,
        obj.display ?? "",
        obj.project ?? null,
      ]);
    } catch {
      // skip parse errors
    }
  }

  await batchInsertEvents(conn, COLUMNS, rows);

  console.log(`  Loaded ${rows.length.toLocaleString()} history entries`);
  return rows.length;
}
