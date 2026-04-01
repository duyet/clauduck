/**
 * Query registry and runner.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { queries } from "./definitions.js";
import type { Filters } from "./filters.js";
import { runQuery } from "../db.js";
import { formatTable } from "../render/table.js";

export { queries, type QueryDef } from "./definitions.js";
export { buildFilters, type Filters } from "./filters.js";

export interface QueryResult {
  id: string;
  title: string;
  columns: string[];
  rows: unknown[][];
}

export async function runAllQueries(
  conn: DuckDBConnection,
  filters: Filters,
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];

  for (const q of queries) {
    try {
      const sql = q.sql(filters);
      const result = await runQuery(conn, sql);
      results.push({
        id: q.id,
        title: q.title,
        columns: result.columns,
        rows: result.rows,
      });
    } catch (err) {
      console.error(`  ERROR in query ${q.id}: ${err}`);
      results.push({ id: q.id, title: q.title, columns: [], rows: [] });
    }
  }

  return results;
}

export function printQueryResults(results: QueryResult[]): void {
  for (const r of results) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${r.id}. ${r.title}`);
    console.log("=".repeat(70));

    if (r.rows.length === 0) {
      console.log("  (no results)");
      continue;
    }

    console.log(formatTable(r.columns, r.rows));
    console.log(`\n(${r.rows.length} rows)`);
  }
}
