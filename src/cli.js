#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runAudit } from "./audit.js";
import { renderMarkdownReport } from "./report.js";

function parseArgs(argv) {
  const args = [...argv];
  const targetUrl = args.shift();
  const options = {
    out: "reports/audit.md"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      options.out = args[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return { targetUrl, options };
}

function printHelp() {
  console.log(`
Consultant SEO Auditor

Usage:
  node src/cli.js <url> --out reports/site-audit.md

Options:
  --out <path>   Markdown report path. Defaults to reports/audit.md
  -h, --help     Show help
`);
}

const { targetUrl, options } = parseArgs(process.argv.slice(2));

if (options.help || !targetUrl) {
  printHelp();
  process.exit(options.help ? 0 : 1);
}

try {
  const audit = await runAudit(targetUrl);
  const markdown = renderMarkdownReport(audit);
  const outputPath = resolve(options.out);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  console.log(`Audit complete: ${outputPath}`);
  console.log(`Issues found: ${audit.issues.length}`);
} catch (error) {
  console.error(`Audit failed: ${error.message}`);
  process.exit(1);
}
