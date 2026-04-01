/**
 * Integration tests for the ETL pipeline against an in-memory DuckDB database.
 * Verifies that createTables + batchInsertEvents round-trip data correctly.
 */

import { describe, it, expect, afterEach } from "vitest";
import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import { createTables } from "../../src/etl/tables.js";
import { batchInsertEvents } from "../../src/etl/insert.js";
import { runQuery } from "../../src/db.js";

let instance: DuckDBInstance | null = null;
let conn: DuckDBConnection | null = null;

async function openMemoryDb(): Promise<DuckDBConnection> {
  instance = await DuckDBInstance.create(":memory:");
  conn = await instance.connect();
  return conn;
}

afterEach(() => {
  if (conn) {
    conn.closeSync();
    conn = null;
  }
  if (instance) {
    instance.closeSync();
    instance = null;
  }
});

describe("createTables", () => {
  it("creates the events table without error", async () => {
    const c = await openMemoryDb();
    await expect(createTables(c)).resolves.toBeUndefined();
  });

  it("creates a table with the expected columns", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    const { columns, rows } = await runQuery(
      c,
      "SELECT column_name FROM information_schema.columns WHERE table_name='events' ORDER BY ordinal_position"
    );
    expect(columns).toContain("column_name");
    const names = rows.map((r) => r[0] as string);

    // spot-check mandatory identity + type columns
    expect(names).toContain("type");
    expect(names).toContain("session_id");
    expect(names).toContain("project_name");
    expect(names).toContain("timestamp");
    // session aggregates
    expect(names).toContain("total_input_tokens");
    expect(names).toContain("total_output_tokens");
    expect(names).toContain("models_used");
    // message fields
    expect(names).toContain("model");
    expect(names).toContain("input_tokens");
    // tool_call fields
    expect(names).toContain("tool_name");
    // history fields
    expect(names).toContain("display");
  });

  it("is idempotent (CREATE OR REPLACE)", async () => {
    const c = await openMemoryDb();
    await createTables(c);
    await expect(createTables(c)).resolves.toBeUndefined();
  });
});

describe("batchInsertEvents — session", () => {
  it("inserts a session event and queries it back", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    const columns = [
      "type",
      "session_id",
      "project_name",
      "source",
      "first_ts",
      "last_ts",
      "duration_minutes",
      "user_messages",
      "assistant_messages",
      "total_input_tokens",
      "total_output_tokens",
      "tool_call_count",
      "models_used",
      "tools_used",
    ];
    const rows = [
      [
        "session",
        "sess-001",
        "my-project",
        "projects",
        new Date("2026-03-15T10:00:00.000Z"),
        new Date("2026-03-15T10:45:00.000Z"),
        45.0,
        12,
        14,
        500000,
        80000,
        30,
        ["claude-sonnet-4-6"],
        ["Bash", "Read", "Edit"],
      ],
    ];

    await batchInsertEvents(c, columns, rows);

    const { rows: result } = await runQuery(
      c,
      "SELECT type, session_id, project_name, duration_minutes, user_messages, total_input_tokens FROM events WHERE type='session'"
    );
    expect(result).toHaveLength(1);
    const [type, sessionId, projectName, durationMinutes, userMessages, inputTokens] =
      result[0];
    expect(type).toBe("session");
    expect(sessionId).toBe("sess-001");
    expect(projectName).toBe("my-project");
    expect(Number(durationMinutes)).toBe(45);
    expect(Number(userMessages)).toBe(12);
    expect(Number(inputTokens)).toBe(500000);
  });

  it("round-trips arrays (models_used, tools_used)", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    await batchInsertEvents(
      c,
      ["type", "session_id", "project_name", "models_used", "tools_used"],
      [
        [
          "session",
          "sess-arr",
          "proj-arr",
          ["claude-sonnet-4-6", "claude-opus-4"],
          ["Bash", "Read"],
        ],
      ]
    );

    const { rows } = await runQuery(
      c,
      "SELECT models_used, tools_used FROM events WHERE session_id='sess-arr'"
    );
    expect(rows).toHaveLength(1);
    // DuckDB returns VARCHAR[] as DuckDBListValue with .items
    const models = rows[0][0] as { items: string[] };
    const tools = rows[0][1] as { items: string[] };
    expect(models.items).toEqual(["claude-sonnet-4-6", "claude-opus-4"]);
    expect(tools.items).toEqual(["Bash", "Read"]);
  });

  it("stores and retrieves timestamps accurately", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    const firstTs = new Date("2026-03-15T08:30:00.000Z");
    const lastTs = new Date("2026-03-15T09:15:00.000Z");

    await batchInsertEvents(
      c,
      ["type", "session_id", "first_ts", "last_ts"],
      [["session", "sess-ts", firstTs, lastTs]]
    );

    const { rows } = await runQuery(
      c,
      "SELECT first_ts::VARCHAR, last_ts::VARCHAR FROM events WHERE session_id='sess-ts'"
    );
    expect(rows).toHaveLength(1);
    // DuckDB stores TIMESTAMP in local precision — just check date portion
    expect(String(rows[0][0])).toContain("2026-03-15");
    expect(String(rows[0][1])).toContain("2026-03-15");
  });
});

describe("batchInsertEvents — message", () => {
  it("inserts message events with token counts", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    const columns = [
      "type",
      "session_id",
      "project_name",
      "message_type",
      "model",
      "timestamp",
      "input_tokens",
      "output_tokens",
      "cache_read_tokens",
      "content_text",
    ];
    const rows = [
      [
        "message",
        "sess-001",
        "my-project",
        "user",
        null,
        new Date("2026-03-15T10:01:00.000Z"),
        0,
        0,
        0,
        "Hello Claude",
      ],
      [
        "message",
        "sess-001",
        "my-project",
        "assistant",
        "claude-sonnet-4-6",
        new Date("2026-03-15T10:01:05.000Z"),
        1200,
        800,
        200,
        "Hello! How can I help?",
      ],
    ];

    await batchInsertEvents(c, columns, rows);

    const { rows: result } = await runQuery(
      c,
      "SELECT message_type, model, input_tokens, output_tokens, cache_read_tokens, content_text FROM events WHERE type='message' ORDER BY timestamp"
    );
    expect(result).toHaveLength(2);

    const [userType, userModel, userInput, , , userText] = result[0];
    expect(userType).toBe("user");
    expect(userModel).toBeNull();
    expect(Number(userInput)).toBe(0);
    expect(userText).toBe("Hello Claude");

    const [assistantType, assistantModel, assistantInput, assistantOutput, cacheRead, assistantText] =
      result[1];
    expect(assistantType).toBe("assistant");
    expect(assistantModel).toBe("claude-sonnet-4-6");
    expect(Number(assistantInput)).toBe(1200);
    expect(Number(assistantOutput)).toBe(800);
    expect(Number(cacheRead)).toBe(200);
    expect(assistantText).toBe("Hello! How can I help?");
  });

  it("round-trips tool_names array on message rows", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    await batchInsertEvents(
      c,
      ["type", "session_id", "message_type", "tool_names"],
      [["message", "sess-tools", "assistant", ["Bash", "Read", "Edit"]]]
    );

    const { rows } = await runQuery(
      c,
      "SELECT tool_names FROM events WHERE session_id='sess-tools'"
    );
    expect(rows).toHaveLength(1);
    const toolNames = rows[0][0] as { items: string[] };
    expect(toolNames.items).toEqual(["Bash", "Read", "Edit"]);
  });
});

describe("batchInsertEvents — tool_call", () => {
  it("inserts tool_call events and queries them back", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    const columns = [
      "type",
      "session_id",
      "project_name",
      "tool_name",
      "tool_use_id",
      "model",
      "timestamp",
    ];
    const rows = [
      [
        "tool_call",
        "sess-001",
        "my-project",
        "Bash",
        "tool-use-abc123",
        "claude-sonnet-4-6",
        new Date("2026-03-15T10:02:00.000Z"),
      ],
      [
        "tool_call",
        "sess-001",
        "my-project",
        "Read",
        "tool-use-def456",
        "claude-sonnet-4-6",
        new Date("2026-03-15T10:02:10.000Z"),
      ],
    ];

    await batchInsertEvents(c, columns, rows);

    const { rows: result } = await runQuery(
      c,
      "SELECT tool_name, tool_use_id FROM events WHERE type='tool_call' ORDER BY timestamp"
    );
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe("Bash");
    expect(result[0][1]).toBe("tool-use-abc123");
    expect(result[1][0]).toBe("Read");
    expect(result[1][1]).toBe("tool-use-def456");
  });
});

describe("batchInsertEvents — history", () => {
  it("inserts history events and queries them back", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    const columns = [
      "type",
      "session_id",
      "project_name",
      "display",
      "timestamp",
    ];
    const rows = [
      [
        "history",
        null,
        "my-project",
        "fix the auth bug",
        new Date("2026-03-15T09:00:00.000Z"),
      ],
      [
        "history",
        null,
        "my-project",
        "add integration tests",
        new Date("2026-03-15T11:00:00.000Z"),
      ],
    ];

    await batchInsertEvents(c, columns, rows);

    const { rows: result } = await runQuery(
      c,
      "SELECT display FROM events WHERE type='history' ORDER BY timestamp"
    );
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe("fix the auth bug");
    expect(result[1][0]).toBe("add integration tests");
  });

  it("handles single-quote characters in display text", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    await batchInsertEvents(
      c,
      ["type", "display"],
      [["history", "it's a test prompt"]]
    );

    const { rows } = await runQuery(
      c,
      "SELECT display FROM events WHERE type='history'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("it's a test prompt");
  });
});

describe("batchInsertEvents — batch processing", () => {
  it("inserts more rows than batchSize in multiple batches", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    const total = 25;
    const rows = Array.from({ length: total }, (_, i) => [
      "tool_call",
      `sess-${i}`,
      "proj",
      `Tool${i}`,
      `id-${i}`,
    ]);

    // batchSize=10 forces 3 batches for 25 rows
    await batchInsertEvents(
      c,
      ["type", "session_id", "project_name", "tool_name", "tool_use_id"],
      rows,
      10
    );

    const { rows: result } = await runQuery(
      c,
      "SELECT count(*) FROM events WHERE type='tool_call'"
    );
    expect(Number(result[0][0])).toBe(total);
  });
});

describe("mixed event types", () => {
  it("can query by type filter isolating each event kind", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    // Insert one of each type
    await batchInsertEvents(
      c,
      ["type", "session_id", "project_name"],
      [
        ["session", "s1", "p1"],
        ["message", "s1", "p1"],
        ["tool_call", "s1", "p1"],
        ["history", null, "p1"],
      ]
    );

    for (const eventType of ["session", "message", "tool_call", "history"]) {
      const { rows } = await runQuery(
        c,
        `SELECT count(*) FROM events WHERE type='${eventType}'`
      );
      expect(Number(rows[0][0])).toBe(1);
    }
  });

  it("total row count equals sum of all event types inserted", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    await batchInsertEvents(
      c,
      ["type", "session_id", "project_name"],
      [
        ["session", "s1", "p1"],
        ["session", "s2", "p1"],
        ["message", "s1", "p1"],
        ["tool_call", "s1", "p1"],
        ["tool_call", "s1", "p1"],
        ["history", null, "p1"],
      ]
    );

    const { rows } = await runQuery(c, "SELECT count(*) FROM events");
    expect(Number(rows[0][0])).toBe(6);
  });

  it("NULL columns for unused event-type fields remain NULL", async () => {
    const c = await openMemoryDb();
    await createTables(c);

    // Insert a history row — session-specific fields should be NULL
    await batchInsertEvents(
      c,
      ["type", "display"],
      [["history", "some prompt"]]
    );

    const { rows } = await runQuery(
      c,
      "SELECT duration_minutes, total_input_tokens, tool_name FROM events WHERE type='history'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBeNull();
    expect(rows[0][1]).toBeNull();
    expect(rows[0][2]).toBeNull();
  });
});
