/**
 * Load ~/.claude/transcripts/*.jsonl into events table.
 * Creates session, message, and tool_call event rows.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseTimestamp } from "./parse.js";
import { batchInsertEvents } from "./insert.js";

const TOOL_NAME_MAP: Record<string, string> = {
  bash: "Bash", read: "Read", edit: "Edit", write: "Write",
  grep: "Grep", glob: "Glob", agent: "Agent",
  web_search: "WebSearch", web_fetch: "WebFetch",
};

const SESSION_COLS = [
  "type", "session_id", "source", "first_ts", "last_ts",
  "file_path", "file_size_mb", "duration_minutes",
  "message_count", "user_messages", "assistant_messages",
  "total_input_tokens", "total_output_tokens", "total_cache_read_tokens", "total_cache_creation_tokens",
  "tools_used", "tool_call_count",
];

const MESSAGE_COLS = [
  "type", "session_id", "source", "message_type", "timestamp",
  "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens",
  "content_text", "content_length",
];

const TOOL_COLS = [
  "type", "session_id", "source", "timestamp",
  "tool_name", "input_tokens", "output_tokens",
];

export async function loadTranscripts(
  conn: DuckDBConnection,
): Promise<{ sessions: number; messages: number; toolCalls: number }> {
  const transcriptsDir = join(homedir(), ".claude", "transcripts");
  if (!existsSync(transcriptsDir)) {
    console.log("  No transcripts directory found, skipping");
    return { sessions: 0, messages: 0, toolCalls: 0 };
  }

  const transcriptFiles = readdirSync(transcriptsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(transcriptsDir, f));

  console.log(`  Found ${transcriptFiles.length.toLocaleString()} transcript files`);

  const sessionRows: unknown[][] = [];
  const messageRows: unknown[][] = [];
  const toolRows: unknown[][] = [];
  let errors = 0;

  for (const fpath of transcriptFiles) {
    const sessionId = basename(fpath, ".jsonl");
    const fileSizeMb = statSync(fpath).size / (1024 * 1024);

    const lines: Record<string, unknown>[] = [];
    const rl = createInterface({
      input: createReadStream(fpath, "utf-8"),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {
        errors++;
      }
    }

    if (lines.length === 0) continue;

    let firstTs: Date | null = null;
    let lastTs: Date | null = null;
    let userCount = 0;
    let assistantCount = 0;
    const tools = new Set<string>();
    let toolCount = 0;

    for (const msg of lines) {
      const msgType = msg.type as string | undefined;
      const ts = parseTimestamp(msg.timestamp);

      if (ts) {
        if (firstTs === null || ts < firstTs) firstTs = ts;
        if (lastTs === null || ts > lastTs) lastTs = ts;
      }

      if (msgType === "user") {
        userCount++;
        let content = msg.content;
        if (typeof content === "string") {
          content = content.slice(0, 2000);
        } else {
          content = String(content ?? "").slice(0, 2000);
        }

        messageRows.push([
          "message", sessionId, "transcripts", "user", ts,
          0, 0, 0, 0,
          content as string, (content as string).length,
        ]);
      } else if (msgType === "tool_use") {
        const rawName = (msg.tool_name as string) ?? "unknown";
        const toolName = TOOL_NAME_MAP[rawName] ?? rawName;
        tools.add(toolName);
        toolCount++;

        toolRows.push([
          "tool_call", sessionId, "transcripts", ts,
          toolName, 0, 0,
        ]);
      } else if (msgType === "assistant") {
        assistantCount++;
        let content = msg.content;
        if (Array.isArray(content)) {
          const textParts = content
            .filter(
              (b): b is Record<string, unknown> =>
                typeof b === "object" && b !== null &&
                (b as Record<string, unknown>).type === "text",
            )
            .map((b) => ((b as Record<string, unknown>).text as string) ?? "");
          content = textParts.join("\n").slice(0, 2000);
        } else if (typeof content === "string") {
          content = content.slice(0, 2000);
        } else {
          content = "";
        }

        messageRows.push([
          "message", sessionId, "transcripts", "assistant", ts,
          0, 0, 0, 0,
          (content as string) || null, (content as string) ? (content as string).length : 0,
        ]);
      }
    }

    let duration: number | null = null;
    if (firstTs && lastTs) {
      duration = (lastTs.getTime() - firstTs.getTime()) / 60000;
    }

    sessionRows.push([
      "session", sessionId, "transcripts", firstTs, lastTs,
      fpath, fileSizeMb, duration,
      lines.length, userCount, assistantCount,
      0, 0, 0, 0, // no token data in transcripts
      tools.size > 0 ? [...tools] : null, toolCount,
    ]);
  }

  await batchInsertEvents(conn, SESSION_COLS, sessionRows);
  await batchInsertEvents(conn, MESSAGE_COLS, messageRows);
  await batchInsertEvents(conn, TOOL_COLS, toolRows);

  console.log(
    `  Loaded ${sessionRows.length.toLocaleString()} transcript sessions, ${messageRows.length.toLocaleString()} messages, ${toolRows.length.toLocaleString()} tool calls`,
  );
  if (errors > 0) {
    console.log(`  (${errors} parse errors skipped)`);
  }

  return { sessions: sessionRows.length, messages: messageRows.length, toolCalls: toolRows.length };
}
