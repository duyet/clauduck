/**
 * Number formatting utilities.
 */

export function formatNumber(n: number): string {
  if (isNaN(n) || n == null) return "0";
  return n.toLocaleString("en-US");
}

export function formatCompact(n: number): string {
  if (isNaN(n) || n == null) return "0";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(1);
}

export function formatCurrency(n: number): string {
  if (isNaN(n) || n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatTokens(n: number): string {
  if (isNaN(n) || n == null) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
