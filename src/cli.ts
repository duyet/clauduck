import { runDashboard } from "./dashboard.js";

interface CliArgs {
  command: "dashboard" | "tui";
  since?: string;
  until?: string;
  last?: string;
  source?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = { command: "dashboard" };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "tui") {
      result.command = "tui";
    } else if (arg === "--since" && i + 1 < args.length) {
      result.since = args[++i];
    } else if (arg === "--until" && i + 1 < args.length) {
      result.until = args[++i];
    } else if (arg === "--last" && i + 1 < args.length) {
      result.last = args[++i];
    } else if (arg === "--source" && i + 1 < args.length) {
      result.source = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("clauduck 0.1.0");
      process.exit(0);
    }
    i++;
  }

  return result;
}

function printHelp(): void {
  console.log(`
clauduck - Analyze your Claude Code usage with DuckDB

Usage:
  clauduck              Load data and print analytics dashboard
  clauduck tui          Interactive TUI with live queries

Options:
  --since YYYY-MM-DD    Start date filter
  --until YYYY-MM-DD    End date filter
  --last 7d|4w|2m       Relative date range
  --source projects|transcripts  Filter by data source
  -h, --help            Show this help
  -v, --version         Show version
`);
}

const args = parseArgs(process.argv);

if (args.command === "tui") {
  const { runTui } = await import("./tui/index.js");
  await runTui(args);
} else {
  await runDashboard(args);
}
