/**
 * SQL value escaping and named-column inserts for the events table.
 */

import type { DuckDBConnection } from "@duckdb/node-api";

export function escapeValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") {
    if (isNaN(val)) return "NULL";
    return String(val);
  }
  if (typeof val === "bigint") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (val instanceof Date) {
    return `'${val.toISOString()}'::TIMESTAMP`;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return "NULL";
    const items = val.map((v) => escapeValue(v)).join(", ");
    return `[${items}]`;
  }
  // String — escape single quotes
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/** Insert an event row using named columns. Only non-null fields need to be specified. */
export function buildEventInsert(fields: Record<string, unknown>): string {
  const cols = Object.keys(fields);
  const vals = cols.map((k) => escapeValue(fields[k]));
  return `INSERT INTO events (${cols.join(", ")}) VALUES (${vals.join(", ")})`;
}

/** Batch insert multiple event rows that share the same column set. */
export function buildBatchEventInsert(
  columns: string[],
  rows: unknown[][],
): string {
  if (rows.length === 0) return "";
  const valueStrings = rows.map((row) => {
    const vals = row.map(escapeValue).join(", ");
    return `(${vals})`;
  });
  return `INSERT INTO events (${columns.join(", ")}) VALUES ${valueStrings.join(",\n")}`;
}

export async function batchInsertEvents(
  conn: DuckDBConnection,
  columns: string[],
  rows: unknown[][],
  batchSize = 1000,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const sql = buildBatchEventInsert(columns, batch);
    if (sql) await conn.run(sql);
  }
}

// Legacy function for backward compatibility during migration
export function buildInsertSQL(table: string, rows: unknown[][]): string {
  if (rows.length === 0) return "";
  const valueStrings = rows.map((row) => {
    const vals = row.map(escapeValue).join(", ");
    return `(${vals})`;
  });
  return `INSERT INTO ${table} VALUES ${valueStrings.join(",\n")}`;
}

export async function batchInsert(
  conn: DuckDBConnection,
  table: string,
  rows: unknown[][],
  batchSize = 1000,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const sql = buildInsertSQL(table, batch);
    if (sql) await conn.run(sql);
  }
}
