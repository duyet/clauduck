import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { openReadOnly, closeDatabase, runQuery, getDefaultDbPath } from "../db.js";
import { queries } from "../queries/definitions.js";
import { buildFilters } from "../queries/filters.js";
import { formatTable } from "../render/table.js";
import type { DuckDBConnection } from "@duckdb/node-api";

type View = "menu" | "result" | "sql";

export function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>("menu");
  const [conn, setConn] = useState<DuckDBConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<string>("");
  const [sqlInput, setSqlInput] = useState("");
  const [dbInfo, setDbInfo] = useState("");

  const menuItems = [
    ...queries.map((q) => ({ label: `${q.id}. ${q.title}`, query: q })),
    { label: "SQL> Custom query", query: null },
    { label: "Quit", query: null },
  ];

  useEffect(() => {
    (async () => {
      try {
        const c = await openReadOnly(getDefaultDbPath());
        setConn(c);
        const info = await runQuery(c, "SELECT count(*) FROM events WHERE type='session'");
        setDbInfo(`${info.rows[0]?.[0] ?? 0} sessions loaded`);
      } catch (err) {
        setError(`Failed to open database: ${err}. Run \`npx clauduck\` first to load data.`);
      }
    })();
    return () => closeDatabase();
  }, []);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (view === "menu") {
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setSelected((s) => Math.min(menuItems.length - 1, s + 1));
      } else if (key.return) {
        const item = menuItems[selected];
        if (item.label === "Quit") {
          exit();
        } else if (item.label.startsWith("SQL>")) {
          setView("sql");
          setSqlInput("");
        } else if (item.query && conn) {
          const filters = buildFilters({});
          const sql = item.query.sql(filters);
          runQuery(conn, sql)
            .then((r) => {
              setResult(
                `${item.query!.title}\n\n${formatTable(r.columns, r.rows)}\n\n(${r.rows.length} rows)`,
              );
              setView("result");
            })
            .catch((err) => {
              setResult(`ERROR: ${err}`);
              setView("result");
            });
        }
      }
    } else if (view === "result") {
      if (key.escape || key.return || input === "b") {
        setView("menu");
      }
    } else if (view === "sql") {
      if (key.escape) {
        setView("menu");
      } else if (key.return && sqlInput.trim() && conn) {
        runQuery(conn, sqlInput)
          .then((r) => {
            setResult(
              `Custom Query\n\n${formatTable(r.columns, r.rows)}\n\n(${r.rows.length} rows)`,
            );
            setView("result");
          })
          .catch((err) => {
            setResult(`ERROR: ${err}`);
            setView("result");
          });
      } else if (key.backspace || key.delete) {
        setSqlInput((s) => s.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setSqlInput((s) => s + input);
      }
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Error: {error}</Text>
      </Box>
    );
  }

  if (!conn) {
    return (
      <Box padding={1}>
        <Text>Loading database...</Text>
      </Box>
    );
  }

  if (view === "result") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>{result}</Text>
        <Text dimColor>{"\n"}Press Enter/b to go back, q to quit</Text>
      </Box>
    );
  }

  if (view === "sql") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Custom SQL Query</Text>
        <Text dimColor>Type your SQL and press Enter. Esc to go back.</Text>
        <Text>{"\n"}SQL&gt; {sqlInput}<Text color="cyan">_</Text></Text>
      </Box>
    );
  }

  // Menu view
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="yellow">🦆 ClauDuck TUI</Text>
      <Text dimColor>{dbInfo} | {getDefaultDbPath()}</Text>
      <Text dimColor>↑↓ to navigate, Enter to select, q to quit{"\n"}</Text>
      {menuItems.map((item, i) => (
        <Text key={i} color={i === selected ? "cyan" : undefined} bold={i === selected}>
          {i === selected ? "❯ " : "  "}{item.label}
        </Text>
      ))}
    </Box>
  );
}
