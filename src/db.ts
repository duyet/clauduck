import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

const DEFAULT_DB_PATH = join(homedir(), ".claude", "clauduck.db");

let instance: DuckDBInstance | null = null;
let connection: DuckDBConnection | null = null;

export async function openDatabase(
  path: string = DEFAULT_DB_PATH,
  options?: { fresh?: boolean },
): Promise<DuckDBConnection> {
  if (options?.fresh) {
    for (const suffix of ["", ".wal"]) {
      const p = path + suffix;
      if (existsSync(p)) unlinkSync(p);
    }
  }

  instance = await DuckDBInstance.create(path, {
    memory_limit: "2GB",
  });
  connection = await instance.connect();
  return connection;
}

export async function openReadOnly(
  path: string = DEFAULT_DB_PATH,
): Promise<DuckDBConnection> {
  instance = await DuckDBInstance.create(path, {
    access_mode: "READ_ONLY",
  });
  connection = await instance.connect();
  return connection;
}

export function closeDatabase(): void {
  if (connection) {
    connection.closeSync();
    connection = null;
  }
  if (instance) {
    instance.closeSync();
    instance = null;
  }
}

export function getDefaultDbPath(): string {
  return DEFAULT_DB_PATH;
}

export async function runQuery(
  conn: DuckDBConnection,
  sql: string,
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const reader = await conn.runAndReadAll(sql);
  const columns = reader.columnNames();
  const rows = reader.getRows();
  return { columns, rows };
}
