import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  banner: { js: "#!/usr/bin/env node" },
  external: ["@duckdb/node-api", "ink", "react", "@inkjs/ui", "ink-text-input"],
  splitting: false,
  clean: true,
  sourcemap: true,
});
