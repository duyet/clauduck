/**
 * Load ~/.claude/projects/*\/*.jsonl into events table.
 * Creates session, message, and tool_call event rows.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseTimestamp, extractProjectName, extractTextContent, EVENT_TYPE } from "./parse.js";
import { batchInsertEvents } from "./insert.js";
import { runQuery } from "../db.js";

const SESSION_COLS = [
  "type", "session_id", "source", "project_dir", "project_name",
  "first_ts", "last_ts", "file_path", "file_size_mb", "duration_minutes",
  "message_count", "user_messages", "assistant_messages",
  "total_input_tokens", "total_output_tokens", "total_cache_read_tokens", "total_cache_creation_tokens",
  "models_used", "tools_used", "tool_call_count", "version", "git_branch",
];

const MESSAGE_COLS = [
  "type", "session_id", "source", "project_name", "uuid",
  "message_type", "timestamp", "model",
  "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens",
  "content_text", "content_length", "tool_names",
  "git_branch", "version", "cwd",
];

const TOOL_COLS = [
  "type", "session_id", "source", "project_name", "timestamp",
  "model", "tool_name", "tool_use_id", "input_tokens", "output_tokens",
];

interface SessionData {
  sessionRow: unknown[];
  messageRows: unknown[][];
  toolRows: unknown[][];
  errors: number;
}

async function processProjectSession(
  fpath: string,
  projectDir: string,
  projectName: string,
): Promise<SessionData> {
  const sessionId = basename(fpath, ".jsonl");
  const fileSizeMb = statSync(fpath).size / (1024 * 1024);

  const messagesRaw: Record<string, unknown>[] = [];
  let errors = 0;

  const rl = createInterface({
    input: createReadStream(fpath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      messagesRaw.push(JSON.parse(line));
    } catch {
      errors++;
    }
  }

  if (messagesRaw.length === 0) {
    return { sessionRow: [], messageRows: [], toolRows: [], errors };
  }

  let firstTs: Date | null = null;
  let lastTs: Date | null = null;
  let version: string | null = null;
  let gitBranch: string | null = null;
  let userCount = 0;
  let assistantCount = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  const models = new Set<string>();
  const tools = new Set<string>();
  let toolCount = 0;
  const messageRows: unknown[][] = [];
  const toolRows: unknown[][] = [];

  for (const msg of messagesRaw) {
    const msgType = msg.type as string | undefined;
    const ts = parseTimestamp(msg.timestamp);

    if (ts) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }

    if (!version && msg.version) version = msg.version as string;
    if (!gitBranch && msg.gitBranch) gitBranch = msg.gitBranch as string;

    if (msgType === "user") userCount++;
    else if (msgType === "assistant") assistantCount++;

    const apiMsg = msg.message as Record<string, unknown> | undefined;
    if (!apiMsg || typeof apiMsg !== "object") continue;

    const usage = (apiMsg.usage as Record<string, number>) ?? {};
    const model = (apiMsg.model as string) ?? "";

    const inputT = usage.input_tokens ?? 0;
    const outputT = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreate = usage.cache_creation_input_tokens ?? 0;

    totalInput += inputT;
    totalOutput += outputT;
    totalCacheRead += cacheRead;
    totalCacheCreation += cacheCreate;

    if (model) models.add(model);

    const content = apiMsg.content;
    const msgTools: string[] = [];
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "tool_use"
        ) {
          const b = block as Record<string, unknown>;
          const toolName = (b.name as string) ?? "unknown";
          tools.add(toolName);
          msgTools.push(toolName);
          toolCount++;
          toolRows.push([
            EVENT_TYPE.TOOL_CALL, sessionId, "projects", projectName, ts,
            model, toolName, (b.id as string) ?? "", inputT, outputT,
          ]);
        }
      }
    }

    let textContent = extractTextContent(content);

    if (msgType === "user" || msgType === "assistant") {
      if (msgType === "user" && !textContent) {
        textContent = extractTextContent(apiMsg.content);
      }

      messageRows.push([
        EVENT_TYPE.MESSAGE, sessionId, "projects", projectName,
        (msg.uuid as string) ?? "",
        msgType, ts, model || null,
        inputT, outputT, cacheRead, cacheCreate,
        textContent || null, textContent ? textContent.length : 0,
        msgTools.length > 0 ? msgTools : null,
        (msg.gitBranch as string) ?? null, (msg.version as string) ?? null,
        (msg.cwd as string) ?? null,
      ]);
    }
  }

  let duration: number | null = null;
  if (firstTs && lastTs) {
    duration = (lastTs.getTime() - firstTs.getTime()) / 60000;
  }

  const sessionRow = [
    EVENT_TYPE.SESSION, sessionId, "projects", projectDir, projectName,
    firstTs, lastTs, fpath, fileSizeMb, duration,
    messagesRaw.length, userCount, assistantCount,
    totalInput, totalOutput, totalCacheRead, totalCacheCreation,
    models.size > 0 ? [...models] : null,
    tools.size > 0 ? [...tools] : null,
    toolCount, version, gitBranch,
  ];

  return { sessionRow, messageRows, toolRows, errors };
}

export async function loadProjectSessions(
  conn: DuckDBConnection,
): Promise<{ sessions: number; messages: number; toolCalls: number }> {
  const projectsDir = join(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) {
    console.log("  No projects directory found");
    return { sessions: 0, messages: 0, toolCalls: 0 };
  }

  const sessionFiles: { path: string; dir: string }[] = [];
  for (const dirName of readdirSync(projectsDir)) {
    const dirPath = join(projectsDir, dirName);
    try {
      if (!statSync(dirPath).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const fileName of readdirSync(dirPath)) {
      if (fileName.endsWith(".jsonl")) {
        sessionFiles.push({ path: join(dirPath, fileName), dir: dirName });
      }
    }
  }

  console.log(`  Found ${sessionFiles.length.toLocaleString()} project session files`);

  const sessionRows: unknown[][] = [];
  const messageRows: unknown[][] = [];
  const toolRows: unknown[][] = [];
  let totalErrors = 0;

  for (let i = 0; i < sessionFiles.length; i++) {
    if ((i + 1) % 200 === 0) {
      console.log(`  Processing ${i + 1}/${sessionFiles.length}...`);

      // Flush accumulated rows in batches
      if (sessionRows.length > 0) {
        await batchInsertEvents(conn, SESSION_COLS, sessionRows);
        sessionRows.length = 0;
      }
      if (messageRows.length > 0) {
        await batchInsertEvents(conn, MESSAGE_COLS, messageRows);
        messageRows.length = 0;
      }
      if (toolRows.length > 0) {
        await batchInsertEvents(conn, TOOL_COLS, toolRows);
        toolRows.length = 0;
      }
    }

    const { path: fpath, dir: dirName } = sessionFiles[i];
    const projectName = extractProjectName(dirName);

    const data = await processProjectSession(fpath, dirName, projectName);
    totalErrors += data.errors;

    if (data.sessionRow.length > 0) {
      sessionRows.push(data.sessionRow);
    }
    messageRows.push(...data.messageRows);
    toolRows.push(...data.toolRows);
  }

  // Flush remaining rows
  if (sessionRows.length > 0) await batchInsertEvents(conn, SESSION_COLS, sessionRows);
  if (messageRows.length > 0) await batchInsertEvents(conn, MESSAGE_COLS, messageRows);
  if (toolRows.length > 0) await batchInsertEvents(conn, TOOL_COLS, toolRows);

  const sessionCount = await getCount(conn, "session");
  const messageCount = await getCount(conn, "message");
  const toolCallCount = await getCount(conn, "tool_call");

  console.log(
    `  Loaded ${sessionCount.toLocaleString()} sessions, ${messageCount.toLocaleString()} messages, ${toolCallCount.toLocaleString()} tool calls`,
  );
  if (totalErrors > 0) {
    console.log(`  (${totalErrors} parse errors skipped)`);
  }

  return { sessions: sessionCount, messages: messageCount, toolCalls: toolCallCount };
}

async function getCount(conn: DuckDBConnection, eventType: string): Promise<number> {
  const result = await runQuery(conn, `SELECT count(*) FROM events WHERE type='${eventType}'`);
  return Number(result.rows[0]?.[0] ?? 0);
}
