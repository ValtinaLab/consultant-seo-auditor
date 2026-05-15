#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runAudit } from "./audit.js";
import { runSiteAudit } from "./site-audit.js";
import { renderMarkdownReport } from "./report.js";

function parseArgs(argv) {
  const args = [...argv];
  const targetUrl = args.shift();
  const options = {
    out: "reports/audit.md",
    render: true,
    site: false,
    maxPages: 10
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      options.out = args[index + 1];
      index += 1;
    } else if (arg === "--no-render") {
      options.render = false;
    } else if (arg === "--site") {
      options.site = true;
    } else if (arg === "--max-pages") {
      options.maxPages = Number.parseInt(args[index + 1], 10);
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
  --site         Discover URLs from sitemap.xml and audit multiple pages
  --max-pages N  Maximum URLs to audit in site mode. Defaults to 10
  --no-render    Skip optional Playwright rendered-DOM checks
  -h, --help     Show help
`);
}

const { targetUrl, options } = parseArgs(process.argv.slice(2));

if (options.help || !targetUrl) {
  printHelp();
  process.exit(options.help ? 0 : 1);
}

try {
  const audit = options.site
    ? await runSiteAudit(targetUrl, { render: options.render, maxPages: options.maxPages })
    : await runAudit(targetUrl, { render: options.render });
  const markdown = renderMarkdownReport(audit);
  const outputPath = resolve(options.out);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  console.log(`Audit complete: ${outputPath}`);
  console.log(`Issues found: ${audit.issues.length}`);
  if (audit.type === "site") {
    console.log(`URLs audited: ${audit.pages.length}`);
  }
} catch (error) {
  console.error(`Audit failed: ${error.message}`);
  process.exit(1);
}
