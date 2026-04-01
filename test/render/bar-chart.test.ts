import { describe, it, expect } from "vitest";
import { formatBarChart } from "../../src/render/bar-chart.js";

describe("formatBarChart", () => {
  it("renders bars with correct proportions", () => {
    const output = formatBarChart([
      { label: "Bash", value: 100 },
      { label: "Read", value: 50 },
    ]);
    expect(output).toContain("Bash");
    expect(output).toContain("Read");
    expect(output).toContain("█");
    expect(output).toContain("░");
  });

  it("returns empty string for no items", () => {
    expect(formatBarChart([])).toBe("");
  });

  it("handles single item", () => {
    const output = formatBarChart([{ label: "Only", value: 42 }]);
    expect(output).toContain("Only");
    // Full bar (all filled)
    expect(output).not.toContain("░");
  });
});
