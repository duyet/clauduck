/**
 * Timestamp parsing and project name extraction utilities.
 * Ported from load.py lines 24-47.
 */

export function parseTimestamp(tsVal: unknown): Date | null {
  if (tsVal == null) return null;

  if (typeof tsVal === "string") {
    try {
      // Handle ISO 8601 with Z or timezone offset
      const d = new Date(tsVal);
      if (!isNaN(d.getTime())) return d;
    } catch {
      return null;
    }
  }

  if (typeof tsVal === "number") {
    try {
      // Unix timestamp in milliseconds
      const d = new Date(tsVal);
      if (!isNaN(d.getTime()) && tsVal > 1e12) return d;
      // Might be seconds
      if (!isNaN(d.getTime()) && tsVal > 1e9) return new Date(tsVal * 1000);
    } catch {
      return null;
    }
  }

  return null;
}

export function extractProjectName(dirName: string): string {
  const parts = dirName.replace(/-/g, "/").replace(/^\/+|\/+$/g, "").split("/");
  const idx = parts.indexOf("project");
  if (idx !== -1 && idx + 1 < parts.length) {
    return parts.slice(idx + 1).join("/");
  }
  return parts[parts.length - 1] || dirName;
}
