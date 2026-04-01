import { describe, it, expect } from "vitest";
import { formatTable } from "../../src/render/table.js";

describe("formatTable", () => {
  it("formats a simple table", () => {
    const output = formatTable(["name", "age"], [["Alice", 30], ["Bob", 25]]);
    expect(output).toContain("name");
    expect(output).toContain("Alice");
    expect(output).toContain("---");
  });

  it("returns no results message for empty rows", () => {
    expect(formatTable(["col"], [])).toBe("  (no results)");
  });

  it("truncates long values", () => {
    const longVal = "x".repeat(100);
    const output = formatTable(["val"], [[longVal]]);
    expect(output).toContain("...");
    expect(output.length).toBeLessThan(200);
  });

  it("handles null values", () => {
    const output = formatTable(["a", "b"], [[null, "ok"]]);
    expect(output).toContain("ok");
  });
});
