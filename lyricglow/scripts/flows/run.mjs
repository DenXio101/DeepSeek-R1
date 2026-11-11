// Runs every verify-*.mjs flow against one dev server. Usage: npm run flows [-- name ...]
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, startDevServer } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const flows = readdirSync(here)
  .filter((f) => /^verify-.*\.mjs$/.test(f))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

const server = await startDevServer();
const results = [];
try {
  for (const f of flows) {
    console.log(`\n▶ ${f}`);
    const code = await new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(here, f)], { stdio: "inherit", env: { ...process.env, FLOWS_BASE: BASE } });
      p.on("exit", (c) => resolve(c ?? 1));
    });
    results.push([f, code]);
  }
} finally {
  server.stop();
}
console.log("\nflows:");
for (const [f, c] of results) console.log(`  ${c === 0 ? "✓" : "✗"} ${f}`);
process.exit(results.some(([, c]) => c !== 0) ? 1 : 0);
