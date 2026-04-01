import { describe, it, expect } from "vitest";
import { formatNumber, formatCompact, formatCurrency, formatTokens } from "../../src/render/format.js";

describe("formatNumber", () => {
  it("formats with commas", () => {
    expect(formatNumber(1397)).toBe("1,397");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });

  it("handles zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatCompact", () => {
  it("formats millions", () => {
    expect(formatCompact(1500000)).toBe("1.5M");
  });

  it("formats thousands", () => {
    expect(formatCompact(1500)).toBe("1.5K");
  });

  it("formats billions", () => {
    expect(formatCompact(1500000000)).toBe("1.5B");
  });
});

describe("formatCurrency", () => {
  it("formats as USD", () => {
    expect(formatCurrency(1276.5)).toBe("$1,276.50");
  });
});

describe("formatTokens", () => {
  it("formats token counts", () => {
    expect(formatTokens(82100000)).toBe("82.1M");
    expect(formatTokens(3714)).toBe("3.7K");
  });
});
