import { describe, it, expect } from "vitest";
import { parseTimestamp, extractProjectName } from "../../src/etl/parse.js";

describe("parseTimestamp", () => {
  it("parses ISO 8601 string", () => {
    const d = parseTimestamp("2026-03-15T10:30:00Z");
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe("2026-03-15T10:30:00.000Z");
  });

  it("parses ISO 8601 with timezone offset", () => {
    const d = parseTimestamp("2026-03-15T10:30:00+07:00");
    expect(d).toBeInstanceOf(Date);
  });

  it("parses Unix millisecond timestamp", () => {
    const d = parseTimestamp(1710489000000);
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it("parses Unix seconds timestamp (10-digit)", () => {
    const d = parseTimestamp(1710489000);
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it("returns null for null/undefined", () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
  });

  it("returns null for invalid string", () => {
    expect(parseTimestamp("not a date")).toBeNull();
  });

  it("returns null for very small numbers", () => {
    expect(parseTimestamp(42)).toBeNull();
  });
});

describe("extractProjectName", () => {
  it("extracts project name from hash directory", () => {
    expect(extractProjectName("-Users-duet-project-claudeduck")).toBe("claudeduck");
  });

  it("extracts nested project name", () => {
    expect(extractProjectName("-Users-duet-project-my-app")).toBe("my/app");
  });

  it("handles directory without 'project' segment", () => {
    const result = extractProjectName("some-random-dir");
    expect(result).toBe("dir");
  });
});
