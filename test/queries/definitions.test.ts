/**
 * Tests that all query definitions produce valid SQL strings.
 * Verifies count, structure, type filters, and date filter propagation.
 */

import { describe, it, expect } from "vitest";
import { queries } from "../../src/queries/definitions.js";
import { buildFilters } from "../../src/queries/filters.js";

const noopFilters = buildFilters({});

describe("queries array", () => {
  it("contains exactly 16 entries (15 numbered + 1b)", () => {
    expect(queries).toHaveLength(16);
  });

  it("includes query id '1b' (DATA SOURCES)", () => {
    const ids = queries.map((q) => q.id);
    expect(ids).toContain("1b");
  });

  it("contains all expected ids from 1 through 15 plus 1b", () => {
    const ids = queries.map((q) => q.id);
    const expected = [
      "1",
      "1b",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
    ];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
  });

  it("every query has a non-empty title", () => {
    for (const q of queries) {
      expect(typeof q.title).toBe("string");
      expect(q.title.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("query SQL generation — no filters", () => {
  it("every query produces a non-empty string", () => {
    for (const q of queries) {
      const sql = q.sql(noopFilters);
      expect(typeof sql).toBe("string");
      expect(sql.trim().length).toBeGreaterThan(0);
    }
  });

  it("every query references FROM events", () => {
    for (const q of queries) {
      const sql = q.sql(noopFilters);
      expect(sql).toContain("FROM events");
    }
  });

  it("every query has a type filter matching its event domain", () => {
    const sessionQueries = ["1", "1b", "2", "3", "8", "9", "10", "11", "12", "13", "14"];
    const messageQueries = ["5", "6", "7"];
    const toolCallQueries = ["4"];
    const historyQueries = ["15"];

    for (const id of sessionQueries) {
      const q = queries.find((x) => x.id === id)!;
      expect(q.sql(noopFilters)).toContain("type='session'");
    }
    for (const id of messageQueries) {
      const q = queries.find((x) => x.id === id)!;
      expect(q.sql(noopFilters)).toContain("type='message'");
    }
    for (const id of toolCallQueries) {
      const q = queries.find((x) => x.id === id)!;
      expect(q.sql(noopFilters)).toContain("type='tool_call'");
    }
    for (const id of historyQueries) {
      const q = queries.find((x) => x.id === id)!;
      expect(q.sql(noopFilters)).toContain("type='history'");
    }
  });

  it("each query SQL is a string that starts with whitespace or SELECT", () => {
    for (const q of queries) {
      const sql = q.sql(noopFilters).trim();
      expect(sql.toUpperCase()).toMatch(/^SELECT/);
    }
  });
});

describe("query SQL generation — with date filters", () => {
  const sinceFilters = buildFilters({ since: "2026-03-01" });
  const untilFilters = buildFilters({ until: "2026-03-31" });
  const rangeFilters = buildFilters({ since: "2026-01-01", until: "2026-03-31" });

  it("session queries include since date in SQL", () => {
    const sessionQueryIds = ["1", "1b", "2", "3", "8", "9", "10", "11", "12", "13", "14"];
    for (const id of sessionQueryIds) {
      const q = queries.find((x) => x.id === id)!;
      const sql = q.sql(sinceFilters);
      expect(sql).toContain("2026-03-01");
    }
  });

  it("message queries include since date in SQL", () => {
    const messageQueryIds = ["5", "6", "7"];
    for (const id of messageQueryIds) {
      const q = queries.find((x) => x.id === id)!;
      const sql = q.sql(sinceFilters);
      expect(sql).toContain("2026-03-01");
    }
  });

  it("tool_call query includes since date in SQL", () => {
    const q = queries.find((x) => x.id === "4")!;
    expect(q.sql(sinceFilters)).toContain("2026-03-01");
  });

  it("history query includes since date in SQL", () => {
    const q = queries.find((x) => x.id === "15")!;
    expect(q.sql(sinceFilters)).toContain("2026-03-01");
  });

  it("until filter is included in session queries", () => {
    const q = queries.find((x) => x.id === "1")!;
    const sql = q.sql(untilFilters);
    expect(sql).toContain("2026-03-31");
  });

  it("both since and until appear in range-filtered SQL", () => {
    const q = queries.find((x) => x.id === "12")!; // WEEKLY TRENDS
    const sql = q.sql(rangeFilters);
    expect(sql).toContain("2026-01-01");
    expect(sql).toContain("2026-03-31");
  });

  it("no-filter SQL differs from filtered SQL for the same query", () => {
    const q = queries.find((x) => x.id === "1")!;
    const baseSql = q.sql(noopFilters);
    const filteredSql = q.sql(sinceFilters);
    expect(filteredSql).not.toBe(baseSql);
  });
});

describe("individual query content", () => {
  it("query 1 (OVERVIEW) selects total_sessions and tokens_M", () => {
    const q = queries.find((x) => x.id === "1")!;
    const sql = q.sql(noopFilters);
    expect(sql).toContain("total_sessions");
    expect(sql).toContain("tokens_M");
  });

  it("query 3 (TOP PROJECTS) has LIMIT 20 and GROUP BY", () => {
    const q = queries.find((x) => x.id === "3")!;
    const sql = q.sql(noopFilters);
    expect(sql).toContain("LIMIT 20");
    expect(sql.toUpperCase()).toContain("GROUP BY");
  });

  it("query 5 (MODEL COST) contains CASE WHEN cost estimation", () => {
    const q = queries.find((x) => x.id === "5")!;
    const sql = q.sql(noopFilters);
    expect(sql).toContain("CASE");
    expect(sql).toContain("est_cost_usd");
  });

  it("query 15 (REPEATED PROMPTS) filters display length > 5 and HAVING count > 2", () => {
    const q = queries.find((x) => x.id === "15")!;
    const sql = q.sql(noopFilters);
    expect(sql).toContain("length(display) > 5");
    expect(sql).toContain("HAVING");
  });

  it("query 6 (HOURLY ACTIVITY) extracts hour from timestamp", () => {
    const q = queries.find((x) => x.id === "6")!;
    const sql = q.sql(noopFilters);
    expect(sql).toContain("extract(hour FROM timestamp)");
  });

  it("query 7 (DAY OF WEEK) uses extract(isodow)", () => {
    const q = queries.find((x) => x.id === "7")!;
    const sql = q.sql(noopFilters);
    expect(sql).toContain("isodow");
  });
});

describe("query sql is a callable function", () => {
  it("every query.sql is a function that accepts Filters", () => {
    for (const q of queries) {
      expect(typeof q.sql).toBe("function");
      expect(() => q.sql(noopFilters)).not.toThrow();
    }
  });

  it("calling sql multiple times with same filters returns identical output", () => {
    for (const q of queries) {
      const first = q.sql(noopFilters);
      const second = q.sql(noopFilters);
      expect(first).toBe(second);
    }
  });
});
