import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { runAudit } from "../src/audit.js";
import { renderMarkdownReport } from "../src/report.js";

const html = `<!doctype html>
<html lang="en">
  <head>
    <title>Sample audit page</title>
    <meta name="description" content="A minimal page for smoke testing the SEO auditor.">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="canonical" href="http://localhost/sample">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Article","headline":"Sample audit page","author":{"@type":"Person","name":"Valentina"}}
    </script>
  </head>
  <body>
    <h1>Sample audit page</h1>
    <p>Smoke test content with enough visible text to verify the static parser.</p>
    <script>window.dataLayer = window.dataLayer || [];</script>
  </body>
</html>`;

const server = createServer((request, response) => {
  if (request.url === "/robots.txt") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n");
    return;
  }

  if (request.url === "/sitemap.xml") {
    response.writeHead(200, { "content-type": "application/xml" });
    response.end("<urlset><url><loc>http://localhost/</loc></url></urlset>");
    return;
  }

  response.writeHead(200, { "content-type": "text/html" });
  response.end(html);
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

try {
  const { port } = server.address();
  const audit = await runAudit(`http://127.0.0.1:${port}/`);
  const markdown = renderMarkdownReport(audit);
  const outputPath = resolve("reports/smoke.md");

  await mkdir("reports", { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  if (!markdown.includes("Technical SEO & Analytics Audit")) {
    throw new Error("Report title was not rendered.");
  }

  console.log(`Smoke test passed: ${outputPath}`);
  console.log(`Issues found: ${audit.issues.length}`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
