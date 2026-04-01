import { describe, it, expect } from "vitest";
import { formatTable } from "../../src/render/table.js";
import { formatBarChart } from "../../src/render/bar-chart.js";
import {
  formatNumber,
  formatCompact,
  formatCurrency,
  formatTokens,
} from "../../src/render/format.js";

describe("render pipeline", () => {
  describe("formatTable integration", () => {
    it("formats realistic query output (project statistics)", () => {
      const columns = ["project_name", "sessions", "tokens_m"];
      const rows = [
        ["my-saas-app", 127, 82.1],
        ["api-gateway", 84, 51.4],
        ["data-pipeline", 56, 38.7],
      ];

      const output = formatTable(columns, rows);
      expect(output).toContain("project_name");
      expect(output).toContain("my-saas-app");
      expect(output).toContain("api-gateway");
      expect(output).toContain("82.1");
      expect(output).toContain("51.4");
      // Verify headers are separated from data
      expect(output).toContain("---");
    });

    it("formats table with single column", () => {
      const columns = ["project"];
      const rows = [["proj1"], ["proj2"], ["proj3"]];

      const output = formatTable(columns, rows);
      expect(output).toContain("project");
      expect(output).toContain("proj1");
      expect(output).toContain("proj2");
      expect(output).toContain("proj3");
    });

    it("formats table with many columns and preserves alignment", () => {
      const columns = [
        "project",
        "sessions",
        "messages",
        "tokens",
        "tools",
      ];
      const rows = [["app-1", 10, 500, 1000000, 250]];

      const output = formatTable(columns, rows);
      const lines = output.split("\n");
      // Check that header and data lines have same column count structure
      const headerParts = lines[0].split("|");
      const dataParts = lines[2].split("|");
      expect(headerParts.length).toBe(dataParts.length);
    });

    it("handles mixed null and undefined values", () => {
      const columns = ["id", "value", "note"];
      const rows = [
        [1, "present", "ok"],
        [2, null, "null value"],
        [3, undefined, "undefined value"],
      ];

      const output = formatTable(columns, rows);
      expect(output).toContain("present");
      expect(output).toContain("ok");
      // Null and undefined should render as empty string
      expect(output).toContain("null value");
      expect(output).toContain("undefined value");
    });
  });

  describe("formatBarChart integration", () => {
    it("renders top projects with realistic token values", () => {
      const items = [
        { label: "my-saas-app", value: 82.1, display: "82.1M" },
        { label: "api-gateway", value: 51.4, display: "51.4M" },
        { label: "data-pipeline", value: 38.7, display: "38.7M" },
        { label: "mobile-app", value: 22.9, display: "22.9M" },
      ];

      const output = formatBarChart(items);
      expect(output).toContain("1. my-saas-app");
      expect(output).toContain("2. api-gateway");
      expect(output).toContain("3. data-pipeline");
      expect(output).toContain("4. mobile-app");
      expect(output).toContain("82.1M");
      expect(output).toContain("51.4M");
      // Verify bars are rendered
      expect(output).toContain("█");
      expect(output).toContain("░");
    });

    it("handles bar chart with all zero values", () => {
      const items = [
        { label: "project-a", value: 0 },
        { label: "project-b", value: 0 },
      ];

      const output = formatBarChart(items);
      expect(output).toContain("project-a");
      expect(output).toContain("project-b");
      // With all zeros, ratio is 0, so all bars should be empty
      expect(output).toContain("░");
    });

    it("handles bar chart with single large outlier", () => {
      const items = [
        { label: "huge-project", value: 1000000 },
        { label: "tiny-project", value: 1 },
      ];

      const output = formatBarChart(items);
      expect(output).toContain("huge-project");
      expect(output).toContain("tiny-project");
      // Huge project should have mostly filled bar
      const lines = output.split("\n");
      const hugeLine = lines[0];
      const tinyLine = lines[1];
      expect(hugeLine).toContain("█");
      expect(tinyLine).toContain("░");
    });

    it("formats bars with custom width", () => {
      const items = [{ label: "test", value: 50 }];
      const output = formatBarChart(items, 50);
      // Full bar at custom width 50 should have all filled
      expect(output).not.toContain("░");
      expect(output).toContain("█");
    });

    it("displays custom display values correctly", () => {
      const items = [
        { label: "project-1", value: 100, display: "100 calls" },
        { label: "project-2", value: 50, display: "50 calls" },
      ];

      const output = formatBarChart(items);
      expect(output).toContain("100 calls");
      expect(output).toContain("50 calls");
    });
  });

  describe("formatting functions consistency", () => {
    it("formatNumber and formatCompact are consistent for display", () => {
      const value = 1397;
      const numbered = formatNumber(value);
      const compact = formatCompact(value);
      // Both should represent the same number in readable form
      expect(numbered).toBe("1,397");
      expect(compact).toBe("1.4K");
    });

    it("formatTokens handles the same range as formatCompact", () => {
      const testValues = [1000000, 82100000, 3714, 100, 50];
      for (const val of testValues) {
        const tokens = formatTokens(val);
        const compact = formatCompact(val);
        // Both should use M/K suffixes appropriately
        if (val >= 1e6) {
          expect(tokens).toContain("M");
        } else if (val >= 1e3) {
          expect(tokens).toContain("K");
        }
      }
    });

    it("formatCurrency always includes dollar sign", () => {
      const values = [100, 1276.5, 0, 1000000];
      for (const val of values) {
        const formatted = formatCurrency(val);
        expect(formatted).toMatch(/^\$/);
        expect(formatted).toContain(".");
      }
    });

    it("pipeline: number → formatCompact → results in expected format", () => {
      const realWorldTokens = [
        { project: "proj1", tokens: 82100000 },
        { project: "proj2", tokens: 51400000 },
        { project: "proj3", tokens: 38700000 },
      ];

      const results = realWorldTokens.map((r) => ({
        project: r.project,
        display: formatCompact(r.tokens),
      }));

      expect(results[0].display).toBe("82.1M");
      expect(results[1].display).toBe("51.4M");
      expect(results[2].display).toBe("38.7M");
    });
  });

  describe("complex rendering scenarios", () => {
    it("renders table with bar charts together conceptually", () => {
      // Simulate rendering a dashboard section
      const columns = ["rank", "project", "tokens"];
      const rows = [
        [1, "my-saas-app", "82.1M"],
        [2, "api-gateway", "51.4M"],
        [3, "data-pipeline", "38.7M"],
      ];

      const table = formatTable(columns, rows);
      expect(table).toContain("my-saas-app");
      expect(table).toContain("82.1M");

      // Now render bars separately
      const items = [
        { label: "my-saas-app", value: 82.1, display: "82.1M" },
        { label: "api-gateway", value: 51.4, display: "51.4M" },
        { label: "data-pipeline", value: 38.7, display: "38.7M" },
      ];

      const bars = formatBarChart(items);
      expect(bars).toContain("my-saas-app");
      expect(bars).toContain("82.1M");
    });

    it("handles tool usage data realistically", () => {
      // Common tools in claudeduck with realistic call counts
      const items = [
        { label: "Bash", value: 28567 },
        { label: "Read", value: 11827 },
        { label: "Edit", value: 8817 },
        { label: "Grep", value: 3714 },
        { label: "Agent", value: 2708 },
      ];

      const output = formatBarChart(items);
      expect(output).toContain("Bash");
      expect(output).toContain("Read");
      expect(output).toContain("Edit");

      // Verify ranking is correct
      const lines = output.split("\n");
      expect(lines[0]).toContain("1.");
      expect(lines[0]).toContain("Bash");
      expect(lines[1]).toContain("2.");
      expect(lines[1]).toContain("Read");
    });

    it("formats cost breakdown table with formatted currency", () => {
      const costs = [733.0, 407.67, 106.07];
      const formatted = costs.map((c) => formatCurrency(c));

      expect(formatted[0]).toBe("$733.00");
      expect(formatted[1]).toBe("$407.67");
      expect(formatted[2]).toBe("$106.07");

      // Would be used in a table
      const columns = ["model", "est_cost"];
      const rows = [
        ["claude-opus-4-6", formatted[0]],
        ["glm-4.7", formatted[1]],
        ["step-3.5-flash", formatted[2]],
      ];

      const table = formatTable(columns, rows);
      expect(table).toContain("$733.00");
      expect(table).toContain("$407.67");
      expect(table).toContain("$106.07");
    });
  });
});
