/**
 * CLI filter builder for --since/--until/--last/--source.
 * Simplified for single events table.
 */

export interface Filters {
  /** Filter for session-type events (uses first_ts) */
  sessions: string;
  /** Filter for message/tool events (uses timestamp) */
  events: string;
  /** Filter for history events (uses timestamp) */
  history: string;
  /** Human-readable label */
  label: string;
}

function parseRelativeDate(value: string): Date {
  const unit = value.slice(-1).toLowerCase();
  const num = parseInt(value.slice(0, -1), 10);
  if (isNaN(num)) throw new Error(`Invalid number in --last ${value}`);

  const now = new Date();
  switch (unit) {
    case "d":
      now.setDate(now.getDate() - num);
      break;
    case "w":
      now.setDate(now.getDate() - num * 7);
      break;
    case "m":
      now.setDate(now.getDate() - num * 30);
      break;
    default:
      throw new Error(`Unknown unit '${unit}' in --last ${value}. Use d/w/m.`);
  }
  return now;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function buildFilters(opts: {
  since?: string;
  until?: string;
  last?: string;
  source?: string;
}): Filters {
  let sf = "";
  let ef = "";
  let hf = "";
  let label = "all time";

  // Source filter
  if (opts.source && opts.source !== "all") {
    sf += `AND source = '${opts.source}'`;
    ef += `AND source = '${opts.source}'`;
    label += ` (${opts.source} only)`;
  }

  if (opts.last) {
    const sinceDate = formatDate(parseRelativeDate(opts.last));
    sf += `AND first_ts >= '${sinceDate}'`;
    ef += `AND timestamp >= '${sinceDate}'`;
    hf += `AND timestamp >= '${sinceDate}'`;
    label = `last ${opts.last}`;
  } else {
    if (opts.since) {
      sf += `AND first_ts >= '${opts.since}'`;
      ef += `AND timestamp >= '${opts.since}'`;
      hf += `AND timestamp >= '${opts.since}'`;
      label = `from ${opts.since}`;
    }
    if (opts.until) {
      sf += ` AND first_ts <= '${opts.until}'`;
      ef += ` AND timestamp <= '${opts.until}'`;
      hf += ` AND timestamp <= '${opts.until}'`;
      label += opts.since ? ` to ${opts.until}` : `until ${opts.until}`;
    }
  }

  return {
    sessions: sf,
    events: ef,
    history: hf,
    label,
  };
}
