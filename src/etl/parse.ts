/**
 * Shared ETL utilities: parsing, extraction, and constants.
 */

export type EventType = "session" | "message" | "tool_call" | "history";

export const EVENT_TYPE = {
  SESSION: "session" as const,
  MESSAGE: "message" as const,
  TOOL_CALL: "tool_call" as const,
  HISTORY: "history" as const,
};

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

export function extractTextContent(content: unknown, maxLen = 2000): string {
  if (Array.isArray(content)) {
    const textParts = content
      .filter(
        (b): b is Record<string, unknown> =>
          typeof b === "object" && b !== null &&
          (b as Record<string, unknown>).type === "text",
      )
      .map((b) => (b.text as string) ?? "");
    return textParts.join("\n").slice(0, maxLen);
  }
  if (typeof content === "string") return content.slice(0, maxLen);
  return "";
}

export function extractProjectName(dirName: string): string {
  const parts = dirName.replace(/-/g, "/").replace(/^\/+|\/+$/g, "").split("/");
  const idx = parts.indexOf("project");
  if (idx !== -1 && idx + 1 < parts.length) {
    return parts.slice(idx + 1).join("/");
  }
  return parts[parts.length - 1] || dirName;
}
