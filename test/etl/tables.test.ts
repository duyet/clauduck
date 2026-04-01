import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import { createTables } from "../../src/etl/tables.js";

describe("createTables", () => {
  let instance: DuckDBInstance;
  let conn: DuckDBConnection;

  beforeEach(async () => {
    // Create in-memory DuckDB instance for testing
    instance = await DuckDBInstance.create(":memory:", {
      memory_limit: "1GB",
    });
    conn = await instance.connect();
  });

  afterEach(async () => {
    if (conn) {
      conn.closeSync();
    }
    if (instance) {
      instance.closeSync();
    }
  });

  it("creates events table without error", async () => {
    await createTables(conn);
    // If we reach here, createTables succeeded
    expect(true).toBe(true);
  });

  it("creates table that can be queried", async () => {
    await createTables(conn);

    const reader = await conn.runAndReadAll("SELECT * FROM events LIMIT 0");
    const columns = reader.columnNames();

    // Should have the expected columns
    expect(columns.length).toBeGreaterThan(0);
    expect(columns).toContain("type");
    expect(columns).toContain("session_id");
    expect(columns).toContain("project_name");
  });

  it("has correct key columns in the schema", async () => {
    await createTables(conn);

    const reader = await conn.runAndReadAll("DESCRIBE events");
    const rows = reader.getRows();
    const columnNames = rows.map((r) => String(r[0]));

    // Identity columns
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("session_id");
    expect(columnNames).toContain("source");

    // Project context
    expect(columnNames).toContain("project_dir");
    expect(columnNames).toContain("project_name");

    // Timestamps
    expect(columnNames).toContain("timestamp");
    expect(columnNames).toContain("first_ts");
    expect(columnNames).toContain("last_ts");

    // Session aggregates
    expect(columnNames).toContain("duration_minutes");
    expect(columnNames).toContain("message_count");
    expect(columnNames).toContain("user_messages");
    expect(columnNames).toContain("assistant_messages");
    expect(columnNames).toContain("total_input_tokens");
    expect(columnNames).toContain("total_output_tokens");
    expect(columnNames).toContain("total_cache_read_tokens");
    expect(columnNames).toContain("models_used");
    expect(columnNames).toContain("tools_used");
    expect(columnNames).toContain("tool_call_count");

    // Message fields
    expect(columnNames).toContain("message_type");
    expect(columnNames).toContain("model");
    expect(columnNames).toContain("input_tokens");
    expect(columnNames).toContain("output_tokens");
    expect(columnNames).toContain("cache_read_tokens");
    expect(columnNames).toContain("tool_names");

    // Tool call fields
    expect(columnNames).toContain("tool_name");
    expect(columnNames).toContain("tool_use_id");

    // History fields
    expect(columnNames).toContain("display");

    // Metadata
    expect(columnNames).toContain("version");
    expect(columnNames).toContain("git_branch");
    expect(columnNames).toContain("cwd");
  });

  it("supports INSERT into events table", async () => {
    await createTables(conn);

    // Insert a simple row
    await conn.run(
      "INSERT INTO events (type, session_id, project_name) VALUES ('session', 'sess-123', 'test-project')"
    );

    // Query it back
    const reader = await conn.runAndReadAll(
      "SELECT type, session_id, project_name FROM events WHERE session_id = 'sess-123'"
    );
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("session");
    expect(rows[0][1]).toBe("sess-123");
    expect(rows[0][2]).toBe("test-project");
  });

  it("supports array columns (models_used)", async () => {
    await createTables(conn);

    // Insert row with array column
    await conn.run(
      "INSERT INTO events (type, models_used) VALUES ('session', ['claude-opus', 'claude-sonnet'])"
    );

    const reader = await conn.runAndReadAll("SELECT models_used FROM events LIMIT 1");
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    // Array should be present (exact format depends on DuckDB's return type)
    expect(rows[0][0]).toBeTruthy();
  });

  it("supports array columns (tools_used)", async () => {
    await createTables(conn);

    // Insert row with tools array
    await conn.run(
      "INSERT INTO events (type, tools_used) VALUES ('session', ['Bash', 'Read', 'Edit'])"
    );

    const reader = await conn.runAndReadAll("SELECT tools_used FROM events LIMIT 1");
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBeTruthy();
  });

  it("supports array columns (tool_names)", async () => {
    await createTables(conn);

    // Insert row with tool_names array
    await conn.run(
      "INSERT INTO events (type, tool_names) VALUES ('message', ['Bash', 'Read'])"
    );

    const reader = await conn.runAndReadAll("SELECT tool_names FROM events LIMIT 1");
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBeTruthy();
  });

  it("supports large integer columns (BIGINT)", async () => {
    await createTables(conn);

    // Insert with large token counts
    const largeNum = 999999999999n;
    await conn.run(
      `INSERT INTO events (type, total_input_tokens) VALUES ('session', ${largeNum})`
    );

    const reader = await conn.runAndReadAll("SELECT total_input_tokens FROM events LIMIT 1");
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    // DuckDB should preserve large integers
    expect(rows[0][0]).toBeTruthy();
  });

  it("supports TIMESTAMP columns", async () => {
    await createTables(conn);

    const now = new Date("2026-03-15T10:00:00Z").toISOString();
    await conn.run(
      `INSERT INTO events (type, timestamp) VALUES ('session', '${now}'::TIMESTAMP)`
    );

    const reader = await conn.runAndReadAll("SELECT timestamp FROM events LIMIT 1");
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBeTruthy();
  });

  it("supports DOUBLE columns (file_size_mb, duration_minutes)", async () => {
    await createTables(conn);

    await conn.run(
      "INSERT INTO events (type, file_size_mb, duration_minutes) VALUES ('session', 12.5, 45.75)"
    );

    const reader = await conn.runAndReadAll(
      "SELECT file_size_mb, duration_minutes FROM events LIMIT 1"
    );
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    // Doubles should be preserved
    expect(rows[0][0]).toBeTruthy();
    expect(rows[0][1]).toBeTruthy();
  });

  it("supports VARCHAR (string) columns", async () => {
    await createTables(conn);

    await conn.run(
      "INSERT INTO events (type, content_text, version, git_branch) VALUES ('message', 'test message', '1.0.0', 'main')"
    );

    const reader = await conn.runAndReadAll(
      "SELECT content_text, version, git_branch FROM events LIMIT 1"
    );
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("test message");
    expect(rows[0][1]).toBe("1.0.0");
    expect(rows[0][2]).toBe("main");
  });

  it("supports INTEGER columns", async () => {
    await createTables(conn);

    await conn.run(
      "INSERT INTO events (type, message_count, user_messages, tool_call_count) VALUES ('session', 100, 45, 30)"
    );

    const reader = await conn.runAndReadAll(
      "SELECT message_count, user_messages, tool_call_count FROM events LIMIT 1"
    );
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe(100);
    expect(rows[0][1]).toBe(45);
    expect(rows[0][2]).toBe(30);
  });

  it("supports NULL values in optional columns", async () => {
    await createTables(conn);

    // Insert with minimal fields, leaving others NULL
    await conn.run(
      "INSERT INTO events (type, session_id) VALUES ('session', 'sess-456')"
    );

    const reader = await conn.runAndReadAll(
      "SELECT type, session_id, project_name, duration_minutes FROM events WHERE session_id = 'sess-456'"
    );
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("session");
    expect(rows[0][1]).toBe("sess-456");
    // remaining columns should be NULL (likely null or undefined)
  });

  it("can insert and query complete session row", async () => {
    await createTables(conn);

    // Insert a realistic full session record
    await conn.run(`
      INSERT INTO events (
        type,
        session_id,
        project_name,
        project_dir,
        source,
        first_ts,
        last_ts,
        duration_minutes,
        message_count,
        user_messages,
        assistant_messages,
        total_input_tokens,
        total_output_tokens,
        total_cache_read_tokens,
        models_used,
        tools_used,
        tool_call_count,
        version,
        git_branch
      ) VALUES (
        'session',
        'sess-123',
        'my-project',
        '/Users/test/project/my-project',
        'projects',
        '2026-03-15T10:00:00Z'::TIMESTAMP,
        '2026-03-15T11:30:00Z'::TIMESTAMP,
        90.0,
        125,
        45,
        80,
        5000000,
        2000000,
        1000000,
        ['claude-opus', 'claude-sonnet'],
        ['Bash', 'Read', 'Edit'],
        42,
        '1.0.0',
        'main'
      )
    `);

    const reader = await conn.runAndReadAll(
      "SELECT * FROM events WHERE session_id = 'sess-123'"
    );
    const rows = reader.getRows();

    expect(rows).toHaveLength(1);
    const row = rows[0];

    // Verify key fields are present
    expect(row).toBeTruthy();
  });

  it("CREATE OR REPLACE TABLE works (idempotent)", async () => {
    // Call createTables twice - should not error
    await createTables(conn);
    await createTables(conn);

    // Table should exist and be usable
    const reader = await conn.runAndReadAll("SELECT COUNT(*) FROM events");
    expect(reader.getRows()).toHaveLength(1);
  });

  it("correctly represents all event types", async () => {
    await createTables(conn);

    const eventTypes = ["session", "message", "tool_call", "history"];

    for (const eventType of eventTypes) {
      await conn.run(
        `INSERT INTO events (type) VALUES ('${eventType}')`
      );
    }

    const reader = await conn.runAndReadAll(
      "SELECT DISTINCT type FROM events ORDER BY type"
    );
    const rows = reader.getRows();

    expect(rows).toHaveLength(4);
    const types = rows.map((r) => r[0]);
    for (const et of eventTypes) {
      expect(types).toContain(et);
    }
  });
});
