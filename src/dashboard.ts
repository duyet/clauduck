/**
 * Default command: load data → run queries → render → print.
 * This is what `npx clauduck` runs.
 */

import { openDatabase, closeDatabase, getDefaultDbPath, runQuery } from "./db.js";
import { loadAll } from "./etl/index.js";
import { buildFilters } from "./queries/filters.js";
import { runAllQueries, printQueryResults } from "./queries/index.js";

interface DashboardArgs {
  since?: string;
  until?: string;
  last?: string;
  source?: string;
}

export async function runDashboard(args: DashboardArgs): Promise<void> {
  const dbPath = getDefaultDbPath();
  console.log(`Creating DuckDB at ${dbPath}`);

  try {
    const conn = await openDatabase(dbPath, { fresh: true });

    await loadAll(conn);

    const filters = buildFilters({
      since: args.since,
      until: args.until,
      last: args.last,
      source: args.source,
    });

    console.log(`\n  Period: ${filters.label}\n`);

    const results = await runAllQueries(conn, filters);
    printQueryResults(results);

    // Print footer
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  Database: ${dbPath}`);
    console.log(`  Interactive: npx clauduck tui`);
    console.log("=".repeat(70));
  } finally {
    closeDatabase();
  }
}
