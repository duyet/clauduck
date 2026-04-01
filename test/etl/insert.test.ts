import { describe, it, expect } from "vitest";
import {
  escapeValue,
  buildEventInsert,
  buildBatchEventInsert,
} from "../../src/etl/insert.js";

describe("escapeValue", () => {
  describe("null and undefined", () => {
    it("converts null to NULL", () => {
      expect(escapeValue(null)).toBe("NULL");
    });

    it("converts undefined to NULL", () => {
      expect(escapeValue(undefined)).toBe("NULL");
    });
  });

  describe("numbers", () => {
    it("converts regular number to string", () => {
      expect(escapeValue(42)).toBe("42");
    });

    it("converts negative numbers", () => {
      expect(escapeValue(-17)).toBe("-17");
    });

    it("converts floating point numbers", () => {
      expect(escapeValue(3.14159)).toBe("3.14159");
    });

    it("converts NaN to NULL", () => {
      expect(escapeValue(NaN)).toBe("NULL");
    });

    it("converts Infinity", () => {
      expect(escapeValue(Infinity)).toBe("Infinity");
    });

    it("converts negative Infinity", () => {
      expect(escapeValue(-Infinity)).toBe("-Infinity");
    });

    it("converts zero", () => {
      expect(escapeValue(0)).toBe("0");
    });

    it("converts negative zero", () => {
      expect(escapeValue(-0)).toBe("0");
    });
  });

  describe("bigint", () => {
    it("converts bigint to string", () => {
      expect(escapeValue(100n)).toBe("100");
    });

    it("converts large bigint", () => {
      expect(escapeValue(999999999999999999999n)).toBe("999999999999999999999");
    });

    it("converts negative bigint", () => {
      expect(escapeValue(-42n)).toBe("-42");
    });
  });

  describe("boolean", () => {
    it("converts true to TRUE", () => {
      expect(escapeValue(true)).toBe("TRUE");
    });

    it("converts false to FALSE", () => {
      expect(escapeValue(false)).toBe("FALSE");
    });
  });

  describe("Date", () => {
    it("converts Date to ISO string with TIMESTAMP cast", () => {
      const date = new Date("2026-03-15T10:00:00.000Z");
      expect(escapeValue(date)).toBe(
        "'2026-03-15T10:00:00.000Z'::TIMESTAMP"
      );
    });

    it("handles different dates", () => {
      const date = new Date("2025-01-01T00:00:00.000Z");
      expect(escapeValue(date)).toBe("'2025-01-01T00:00:00.000Z'::TIMESTAMP");
    });
  });

  describe("strings", () => {
    it("escapes simple string with single quotes", () => {
      expect(escapeValue("hello")).toBe("'hello'");
    });

    it("escapes empty string", () => {
      expect(escapeValue("")).toBe("''");
    });

    it("escapes string with single quotes by doubling them", () => {
      expect(escapeValue("it's")).toBe("'it''s'");
    });

    it("escapes multiple single quotes", () => {
      expect(escapeValue("it's a'test")).toBe("'it''s a''test'");
    });

    it("escapes string with special characters", () => {
      expect(escapeValue('hello "world"')).toBe("'hello \"world\"'");
    });

    it("escapes string with newlines", () => {
      expect(escapeValue("hello\nworld")).toBe("'hello\nworld'");
    });

    it("escapes string with tabs", () => {
      expect(escapeValue("hello\tworld")).toBe("'hello\tworld'");
    });
  });

  describe("arrays", () => {
    it("converts empty array to NULL", () => {
      expect(escapeValue([])).toBe("NULL");
    });

    it("converts array of strings", () => {
      expect(escapeValue(["a", "b"])).toBe("['a', 'b']");
    });

    it("converts array of numbers", () => {
      expect(escapeValue([1, 2, 3])).toBe("[1, 2, 3]");
    });

    it("converts array with mixed types", () => {
      expect(escapeValue([1, "two", true])).toBe("[1, 'two', TRUE]");
    });

    it("converts array with null values", () => {
      expect(escapeValue([1, null, 3])).toBe("[1, NULL, 3]");
    });

    it("converts array with booleans", () => {
      expect(escapeValue([true, false])).toBe("[TRUE, FALSE]");
    });

    it("converts nested arrays", () => {
      expect(escapeValue([[1, 2], [3, 4]])).toBe("[[1, 2], [3, 4]]");
    });

    it("converts array with strings containing quotes", () => {
      expect(escapeValue(["it's", "quoted"])).toBe("['it''s', 'quoted']");
    });

    it("converts single-element array", () => {
      expect(escapeValue(["single"])).toBe("['single']");
    });
  });

  describe("type coercion for non-standard types", () => {
    it("converts object to string representation", () => {
      expect(escapeValue({ key: "value" })).toBe("'[object Object]'");
    });

    it("converts Symbol to string representation", () => {
      const sym = Symbol("test");
      expect(escapeValue(sym)).toBe("'Symbol(test)'");
    });
  });
});

describe("buildEventInsert", () => {
  it("builds insert with simple fields", () => {
    const fields = { name: "Alice", age: 30 };
    const result = buildEventInsert(fields);
    expect(result).toBe(
      "INSERT INTO events (name, age) VALUES ('Alice', 30)"
    );
  });

  it("builds insert with null values", () => {
    const fields = { name: "Bob", age: null };
    const result = buildEventInsert(fields);
    expect(result).toBe("INSERT INTO events (name, age) VALUES ('Bob', NULL)");
  });

  it("builds insert with various types", () => {
    const fields = {
      id: 1,
      active: true,
      created: new Date("2026-03-15T10:00:00.000Z"),
    };
    const result = buildEventInsert(fields);
    expect(result).toBe(
      "INSERT INTO events (id, active, created) VALUES (1, TRUE, '2026-03-15T10:00:00.000Z'::TIMESTAMP)"
    );
  });

  it("builds insert with single field", () => {
    const fields = { event_type: "login" };
    const result = buildEventInsert(fields);
    expect(result).toBe("INSERT INTO events (event_type) VALUES ('login')");
  });

  it("builds insert with string containing quotes", () => {
    const fields = { message: "It's working" };
    const result = buildEventInsert(fields);
    expect(result).toBe("INSERT INTO events (message) VALUES ('It''s working')");
  });

  it("builds insert with array field", () => {
    const fields = { tags: ["a", "b", "c"] };
    const result = buildEventInsert(fields);
    expect(result).toBe("INSERT INTO events (tags) VALUES (['a', 'b', 'c'])");
  });

  it("preserves field order (first-in order)", () => {
    const fields = { z: 1, a: 2, m: 3 };
    const result = buildEventInsert(fields);
    // Object key order in modern JS is insertion order
    expect(result).toMatch(/INSERT INTO events \(z, a, m\) VALUES \(1, 2, 3\)/);
  });
});

describe("buildBatchEventInsert", () => {
  it("returns empty string for empty rows", () => {
    const result = buildBatchEventInsert(["col1", "col2"], []);
    expect(result).toBe("");
  });

  it("builds insert for single row with 2 columns", () => {
    const columns = ["name", "age"];
    const rows = [["Alice", 30]];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (name, age) VALUES ('Alice', 30)"
    );
  });

  it("builds insert for multiple rows", () => {
    const columns = ["name", "age"];
    const rows = [
      ["Alice", 30],
      ["Bob", 25],
      ["Charlie", 35],
    ];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (name, age) VALUES ('Alice', 30),\n('Bob', 25),\n('Charlie', 35)"
    );
  });

  it("handles rows with null values", () => {
    const columns = ["name", "email"];
    const rows = [
      ["Alice", "alice@example.com"],
      ["Bob", null],
    ];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (name, email) VALUES ('Alice', 'alice@example.com'),\n('Bob', NULL)"
    );
  });

  it("handles rows with various types", () => {
    const columns = ["id", "active", "count"];
    const rows = [
      [1, true, 100],
      [2, false, 200],
    ];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (id, active, count) VALUES (1, TRUE, 100),\n(2, FALSE, 200)"
    );
  });

  it("handles rows with strings containing quotes", () => {
    const columns = ["text"];
    const rows = [["It's working"], ["She said \"hello\""]];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (text) VALUES ('It''s working'),\n('She said \"hello\"')"
    );
  });

  it("handles rows with Date objects", () => {
    const columns = ["timestamp"];
    const rows = [[new Date("2026-03-15T10:00:00.000Z")]];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (timestamp) VALUES ('2026-03-15T10:00:00.000Z'::TIMESTAMP)"
    );
  });

  it("handles rows with arrays", () => {
    const columns = ["tags"];
    const rows = [[["a", "b"]], [["x", "y", "z"]]];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (tags) VALUES (['a', 'b']),\n(['x', 'y', 'z'])"
    );
  });

  it("handles rows with multiple columns and mixed types", () => {
    const columns = ["id", "name", "active", "created"];
    const rows = [
      [1, "Alice", true, new Date("2026-03-15T10:00:00.000Z")],
      [2, "Bob", false, new Date("2026-03-16T10:00:00.000Z")],
    ];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (id, name, active, created) VALUES (1, 'Alice', TRUE, '2026-03-15T10:00:00.000Z'::TIMESTAMP),\n(2, 'Bob', FALSE, '2026-03-16T10:00:00.000Z'::TIMESTAMP)"
    );
  });

  it("handles empty arrays in rows (converts to NULL)", () => {
    const columns = ["tags"];
    const rows = [[["a"]], [[]]];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (tags) VALUES (['a']),\n(NULL)"
    );
  });

  it("formats newlines between multiple rows", () => {
    const columns = ["data"];
    const rows = [["first"], ["second"], ["third"]];
    const result = buildBatchEventInsert(columns, rows);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("VALUES ('first')");
    expect(lines[1]).toContain("('second')");
    expect(lines[2]).toContain("('third')");
  });

  it("handles bigint in rows", () => {
    const columns = ["big_num"];
    const rows = [[999999999999999999999n], [100n]];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (big_num) VALUES (999999999999999999999),\n(100)"
    );
  });

  it("handles undefined values in rows (converts to NULL)", () => {
    const columns = ["value"];
    const rows = [["present"], [undefined], [null]];
    const result = buildBatchEventInsert(columns, rows);
    expect(result).toBe(
      "INSERT INTO events (value) VALUES ('present'),\n(NULL),\n(NULL)"
    );
  });
});
