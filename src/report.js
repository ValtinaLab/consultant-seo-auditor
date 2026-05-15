const SEVERITIES = ["Critical", "High", "Medium", "Low"];

export function renderMarkdownReport(audit) {
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
  return issues.map((issue) => `- ${issue.title}: ${issue.fix}`).join("\n");
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
