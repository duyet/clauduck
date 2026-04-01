import { describe, it, expect } from "vitest";
import { buildFilters } from "../../src/queries/filters.js";

describe("buildFilters", () => {
  it("returns all-time by default", () => {
    const f = buildFilters({});
    expect(f.label).toBe("all time");
    expect(f.sessions).toBe("");
    expect(f.events).toBe("");
    expect(f.history).toBe("");
  });

  it("handles --since", () => {
    const f = buildFilters({ since: "2026-03-01" });
    expect(f.sessions).toContain("2026-03-01");
    expect(f.events).toContain("2026-03-01");
    expect(f.label).toBe("from 2026-03-01");
  });

  it("handles --since and --until", () => {
    const f = buildFilters({ since: "2026-03-01", until: "2026-03-31" });
    expect(f.sessions).toContain("2026-03-01");
    expect(f.sessions).toContain("2026-03-31");
    expect(f.label).toBe("from 2026-03-01 to 2026-03-31");
  });

  it("handles --last 7d", () => {
    const f = buildFilters({ last: "7d" });
    expect(f.label).toBe("last 7d");
    expect(f.sessions).toContain("first_ts >=");
    expect(f.events).toContain("timestamp >=");
  });

  it("handles --source filter", () => {
    const f = buildFilters({ source: "projects" });
    expect(f.sessions).toContain("source = 'projects'");
    expect(f.events).toContain("source = 'projects'");
    expect(f.label).toContain("projects only");
  });
});
