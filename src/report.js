const SEVERITIES = ["Critical", "High", "Medium", "Low"];

export function renderMarkdownReport(audit) {
  if (audit.type === "site") {
    return renderSiteMarkdownReport(audit);
  }

  const grouped = groupBySeverity(audit.issues);
  const quickWins = audit.issues.filter((issue) => issue.effort === "Low").slice(0, 6);
  const blockers = audit.issues.filter((issue) => issue.severity === "Critical" || issue.severity === "High");

  return `# Technical SEO & Analytics Audit

**URL:** ${audit.url}  
**Audited at:** ${audit.auditedAt}  
**HTTP status:** ${audit.status}

## Executive Summary

${executiveSummary(audit, blockers)}

## Priority Matrix

| Priority | Issue | Area | Effort | Why it matters |
| --- | --- | --- | --- | --- |
${audit.issues.map((issue) => `| ${issue.severity} | ${escapeTable(issue.title)} | ${issue.area} | ${issue.effort} | ${escapeTable(issue.evidence)} |`).join("\n")}

## Fix, Validation, Tool Plan

| Issue | Fix | Validation | Suggested tools |
| --- | --- | --- | --- |
${audit.issues.map((issue) => `| ${escapeTable(issue.title)} | ${escapeTable(issue.fix)} | ${escapeTable(issue.validation)} | ${toolFor(issue.area)} |`).join("\n")}

## Quick Wins Under One Hour

${quickWins.length ? quickWins.map((issue) => `- **${issue.title}:** ${issue.fix}`).join("\n") : "- No low-effort quick wins were detected in the static audit."}

## 30-Day Action Plan

### Week 1: Blockers and measurement

${weekItems(grouped.Critical.concat(grouped.High).slice(0, 5))}

### Week 2: Indexability and on-page fixes

${weekItems(audit.issues.filter((issue) => ["indexability", "on-page", "schema"].includes(issue.area)).slice(0, 5))}

### Week 3: Performance, mobile, and trust

${weekItems(audit.issues.filter((issue) => ["performance", "mobile", "trust", "security"].includes(issue.area)).slice(0, 5))}

### Week 4: Validation and reporting loop

- Re-run the audit and compare issue count by severity.
- Validate fixed URLs with Search Console, Rich Results Test, Lighthouse, and Tag Assistant.
- Create an owner, due date, and acceptance check for every remaining Medium and Low issue.
- Document tracking and schema conventions so new pages ship with the right defaults.

## Observed Signals

| Signal | Value |
| --- | --- |
| Title | ${escapeTable(audit.facts.title || "Not found")} |
| Meta description | ${escapeTable(audit.facts.description || "Not found")} |
| Canonical | ${escapeTable(audit.facts.canonical || "Not found")} |
| Viewport | ${escapeTable(audit.facts.viewport || "Not found")} |
| HTML lang | ${escapeTable(audit.facts.lang || "Not found")} |
| H1 count | ${audit.facts.h1s.length} |
| JSON-LD blocks | ${audit.facts.jsonLd.length} |
| robots.txt | ${audit.facts.hasRobotsTxt ? "Found" : "Not found"} |
| XML sitemap | ${audit.facts.hasSitemap ? "Found" : "Not found"} |
| Static visible text length | ${audit.facts.visibleTextLength} chars |
| Rendered DOM pass | ${renderStatus(audit)} |
| Rendered text growth | ${audit.renderComparison.available ? `${audit.renderComparison.textGrowth} chars` : "Not available"} |

## Notes

Static findings come from the initial HTML response. Rendered-DOM findings use Playwright when available, which helps validate JavaScript SEO, hydration, mobile viewport behavior, and client-injected schema.

${audit.auditNotes?.length ? audit.auditNotes.map((note) => `- ${note}`).join("\n") : "- No audit runtime limitations were detected."}
`;
}

function renderSiteMarkdownReport(audit) {
  const grouped = groupBySeverity(audit.issues);
  const quickWins = audit.issues.filter((issue) => issue.effort === "Low").slice(0, 8);
  const blockers = audit.issues.filter((issue) => issue.severity === "Critical" || issue.severity === "High");
  const totalPageIssues = audit.pages.reduce((sum, page) => sum + page.issues.length, 0);

  return `# Site Technical SEO & Analytics Audit

**Start URL:** ${audit.url}  
**Audited at:** ${audit.auditedAt}  
**URLs audited:** ${audit.pages.length}  
**Discovery:** ${discoverySummary(audit)}

## Executive Summary

${siteExecutiveSummary(audit, blockers, totalPageIssues)}

## Priority Matrix

| Priority | Issue | Area | Effort | Affected URLs | Templates | Why it matters |
| --- | --- | --- | --- | ---: | --- | --- |
${audit.issues.map((issue) => `| ${issue.severity} | ${escapeTable(issue.title)} | ${issue.area} | ${issue.effort} | ${issue.affectedUrls.length} | ${escapeTable(issue.templates.join(", "))} | ${escapeTable(issue.evidence)} |`).join("\n")}

## Fix, Validation, Tool Plan

| Issue | Fix | Validation | Suggested tools |
| --- | --- | --- | --- |
${audit.issues.map((issue) => `| ${escapeTable(issue.title)} | ${escapeTable(issue.fix)} | ${escapeTable(issue.validation)} | ${toolFor(issue.area)} |`).join("\n")}

## Affected URL Examples

${audit.issues.slice(0, 12).map((issue) => affectedUrlBlock(issue)).join("\n\n")}

## Quick Wins Under One Hour

${quickWins.length ? quickWins.map((issue) => `- **${issue.title}:** ${issue.fix} (${issue.affectedUrls.length} URL${issue.affectedUrls.length === 1 ? "" : "s"})`).join("\n") : "- No low-effort quick wins were detected in the site audit."}

## 30-Day Action Plan

### Week 1: Critical patterns and measurement

${weekItems(grouped.Critical.concat(grouped.High).slice(0, 6))}

### Week 2: Templates with repeated SEO issues

${weekItems(audit.issues.filter((issue) => issue.affectedUrls.length > 1 && ["indexability", "on-page", "schema"].includes(issue.area)).slice(0, 6))}

### Week 3: Performance, mobile, trust, and security

${weekItems(audit.issues.filter((issue) => ["performance", "mobile", "trust", "security"].includes(issue.area)).slice(0, 6))}

### Week 4: Validation and prevention

- Re-run the site audit and compare issue count by severity and affected URLs.
- Validate representative URLs from each affected template.
- Add acceptance checks to page templates so titles, descriptions, canonicals, schema, and analytics ship by default.
- Create owner, due date, and validation evidence for every remaining Medium and Low pattern.

## Pages Audited

| URL | Status | Issues | Title | Rendered DOM |
| --- | ---: | ---: | --- | --- |
${audit.pages.map((page) => `| ${escapeTable(page.url)} | ${page.status} | ${page.issues.length} | ${escapeTable(page.facts.title || "Not found")} | ${renderStatus(page)} |`).join("\n")}

## Notes

Static findings come from initial HTML responses. Rendered-DOM findings use Playwright when available. Aggregated issues are grouped by area, severity, title, fix, and validation guidance so repeated template problems are easier to prioritize.

${siteNotes(audit)}
`;
}

function executiveSummary(audit, blockers) {
  const issueCount = audit.issues.length;
  const critical = audit.issues.filter((issue) => issue.severity === "Critical").length;
  const high = audit.issues.filter((issue) => issue.severity === "High").length;

  if (issueCount === 0) {
    return "No issues were detected in the static audit. The next opportunity is to validate rendered DOM, field performance, and analytics events with browser-based tooling.";
  }

  const topItems = blockers.slice(0, 3).map((issue) => `**${issue.title}**`).join(", ");
  return `The audit found **${issueCount} issues**, including **${critical} Critical** and **${high} High** priority items. The biggest blockers or opportunities are: ${topItems || "the Medium priority improvements listed below"}. The fastest path is to secure measurement and indexability first, then validate schema, mobile rendering, and third-party performance.`;
}

function groupBySeverity(issues) {
  return Object.fromEntries(SEVERITIES.map((severity) => [severity, issues.filter((issue) => issue.severity === severity)]));
}

function weekItems(issues) {
  if (!issues.length) return "- No matching issues detected in this phase.";
  return issues.map((issue) => {
    const scope = issue.affectedUrls ? ` (${issue.affectedUrls.length} URL${issue.affectedUrls.length === 1 ? "" : "s"})` : "";
    return `- ${issue.title}${scope}: ${issue.fix}`;
  }).join("\n");
}

function toolFor(area) {
  const tools = {
    analytics: "GA4 DebugView, Tag Assistant, browser network panel",
    rendering: "Playwright, Google Rich Results Test, URL Inspection",
    indexability: "Search Console, robots tester, curl",
    "on-page": "Screaming Frog, browser inspector, accessibility tree",
    schema: "Rich Results Test, Schema.org validator",
    mobile: "Chrome DevTools mobile emulation, Lighthouse",
    performance: "Lighthouse, WebPageTest, Chrome Coverage",
    trust: "Manual review, schema validator, internal link crawl",
    security: "Security headers scanner, browser security panel"
  };

  return tools[area] || "Manual QA";
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderStatus(audit) {
  if (audit.rendered?.ok) return "Completed";
  if (audit.rendered?.skipped) return "Skipped";
  return `Unavailable: ${audit.rendered?.error || "Unknown error"}`;
}

function siteExecutiveSummary(audit, blockers, totalPageIssues) {
  const issueCount = audit.issues.length;
  const critical = audit.issues.filter((issue) => issue.severity === "Critical").length;
  const high = audit.issues.filter((issue) => issue.severity === "High").length;

  if (issueCount === 0) {
    return `The site audit covered **${audit.pages.length} URLs** and found no grouped issues. The next step is to expand crawl depth and validate rendered DOM plus field performance.`;
  }

  const topItems = blockers.slice(0, 3).map((issue) => `**${issue.title}** (${issue.affectedUrls.length} URL${issue.affectedUrls.length === 1 ? "" : "s"})`).join(", ");
  return `The site audit covered **${audit.pages.length} URLs** and grouped **${totalPageIssues} page-level findings** into **${issueCount} issue patterns**. There are **${critical} Critical** and **${high} High** priority patterns. The biggest blockers or opportunities are: ${topItems || "the Medium priority patterns listed below"}. Prioritize fixes that affect multiple URLs or shared templates first.`;
}

function discoverySummary(audit) {
  if (audit.discovery.method === "sitemap.xml") {
    return `sitemap.xml (${audit.discovery.totalDiscovered} discovered, ${audit.pages.length} audited)`;
  }

  return audit.discovery.error
    ? `fallback to start URL (${audit.discovery.error})`
    : "fallback to start URL";
}

function affectedUrlBlock(issue) {
  const urls = issue.affectedUrls.slice(0, 5).map((url) => `- ${url}`).join("\n");
  const remaining = issue.affectedUrls.length > 5 ? `\n- ...and ${issue.affectedUrls.length - 5} more` : "";
  return `### ${issue.severity}: ${issue.title}\n\n${urls}${remaining}`;
}

function siteNotes(audit) {
  const notes = unique([
    ...audit.auditNotes,
    ...audit.pages.flatMap((page) => page.auditNotes || []).map((note) => `Page note: ${note}`)
  ]);

  return notes.length ? notes.map((note) => `- ${note}`).join("\n") : "- No audit runtime limitations were detected.";
}

function unique(values) {
  return [...new Set(values)];
}
