import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { runAudit } from "../src/audit.js";
import { runSiteAudit } from "../src/site-audit.js";
import { renderMarkdownReport } from "../src/report.js";

let baseUrl = "";

function html(title, h1) {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta name="description" content="A minimal page for smoke testing the SEO auditor.">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="canonical" href="${baseUrl}/sample">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Article","headline":"${title}","author":{"@type":"Person","name":"Valentina"}}
    </script>
  </head>
  <body>
    <h1>${h1}</h1>
    <p>Smoke test content with enough visible text to verify the static parser.</p>
    <script>window.dataLayer = window.dataLayer || [];</script>
  </body>
</html>`;
}

const server = createServer((request, response) => {
  if (request.url === "/robots.txt") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n");
    return;
  }

  if (request.url === "/sitemap.xml") {
    response.writeHead(200, { "content-type": "application/xml" });
    response.end(`<urlset>
      <url><loc>${baseUrl}/</loc></url>
      <url><loc>${baseUrl}/article/sample-one</loc></url>
      <url><loc>${baseUrl}/article/sample-two</loc></url>
    </urlset>`);
    return;
  }

  response.writeHead(200, { "content-type": "text/html" });
  response.end(html("Sample audit page", request.url === "/" ? "Sample audit page" : "Sample article page"));
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

try {
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  const audit = await runAudit(`${baseUrl}/`);
  const markdown = renderMarkdownReport(audit);
  const outputPath = resolve("reports/smoke.md");

  await mkdir("reports", { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  if (!markdown.includes("Technical SEO & Analytics Audit")) {
    throw new Error("Report title was not rendered.");
  }

  console.log(`Smoke test passed: ${outputPath}`);
  console.log(`Issues found: ${audit.issues.length}`);

  const siteAudit = await runSiteAudit(`${baseUrl}/`, { maxPages: 3, render: false });
  const siteMarkdown = renderMarkdownReport(siteAudit);
  const siteOutputPath = resolve("reports/smoke-site.md");

  await writeFile(siteOutputPath, siteMarkdown, "utf8");

  if (!siteMarkdown.includes("Site Technical SEO & Analytics Audit")) {
    throw new Error("Site report title was not rendered.");
  }

  if (siteAudit.pages.length !== 3) {
    throw new Error(`Expected 3 audited URLs, got ${siteAudit.pages.length}.`);
  }

  if (!siteAudit.issues.some((issue) => issue.affectedUrls?.length === 3)) {
    throw new Error("Expected at least one issue affecting all smoke URLs.");
  }

  console.log(`Site smoke test passed: ${siteOutputPath}`);
  console.log(`Grouped issues found: ${siteAudit.issues.length}`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
