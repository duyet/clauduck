/**
 * ASCII table formatter.
 * Ported from query.py run_query function (lines 21-58).
 */

export function formatTable(
  columns: string[],
  rows: unknown[][],
  maxColWidth = 60,
): string {
  if (rows.length === 0) return "  (no results)";

  // Convert all values to strings
  const strRows = rows.map((row) =>
    row.map((val) => {
      if (val == null) return "";
      let s = String(val);
      if (s.length > maxColWidth) s = s.slice(0, maxColWidth - 3) + "...";
      return s;
    }),
  );

  // Calculate column widths
  const widths = columns.map((c, i) => {
    let w = c.length;
    for (const row of strRows) {
      w = Math.max(w, (row[i] ?? "").length);
    }
    return w;
  });

  const lines: string[] = [];

  // Header
  lines.push(columns.map((c, i) => c.padEnd(widths[i])).join(" | "));
  lines.push(widths.map((w) => "-".repeat(w)).join("-+-"));

  // Rows
  for (const row of strRows) {
    lines.push(row.map((v, i) => (v ?? "").padEnd(widths[i])).join(" | "));
  }

  return lines.join("\n");
}
