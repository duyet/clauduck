/**
 * Horizontal bar chart renderer using block characters.
 */

const BAR_WIDTH = 30;

export function formatBarChart(
  items: { label: string; value: number; display?: string }[],
  width = BAR_WIDTH,
): string {
  if (items.length === 0) return "";

  const maxValue = Math.max(...items.map((i) => i.value));
  const maxLabelLen = Math.max(...items.map((i) => i.label.length));

  return items
    .map((item, idx) => {
      const ratio = maxValue > 0 ? item.value / maxValue : 0;
      const filled = Math.round(ratio * width);
      const empty = width - filled;
      const bar = "█".repeat(filled) + "░".repeat(empty);
      const rank = String(idx + 1).padStart(2);
      const label = item.label.padEnd(maxLabelLen);
      const display = item.display ?? item.value.toLocaleString("en-US");
      return ` ${rank}. ${label} ${display.padStart(8)} ${bar}`;
    })
    .join("\n");
}
