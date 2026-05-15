import { runAudit } from "./audit.js";

const USER_AGENT =
  "ConsultantSEOAuditor/0.1 Site Crawler (+https://github.com/ValtinaLab/consultant-seo-auditor)";

const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_MAX_PAGES = 10;

export async function runSiteAudit(inputUrl, options = {}) {
  const startedAt = new Date();
  const startUrl = normalizeUrl(inputUrl);
  const origin = new URL(startUrl).origin;
  const maxPages = positiveInteger(options.maxPages) || DEFAULT_MAX_PAGES;
  const discovered = await discoverUrls(startUrl, maxPages);
  const pages = [];
  const auditNotes = [];

  for (const url of discovered.urls) {
    try {
      pages.push(await runAudit(url, { render: options.render }));
    } catch (error) {
      pages.push(failedPageAudit(url, error));
      auditNotes.push(`Failed to audit ${url}: ${error.message}`);
    }
  }

  const issues = aggregateIssues(pages);

  return {
    type: "site",
    url: startUrl,
    origin,
    auditedAt: startedAt.toISOString(),
    discovery: discovered,
    pages,
    issues,
    auditNotes
  };
}

async function discoverUrls(startUrl, maxPages) {
  const origin = new URL(startUrl).origin;
  const sitemapUrl = `${origin}/sitemap.xml`;

  try {
    const sitemap = await fetchText(sitemapUrl);
    const sitemapUrls = await extractUrlsFromSitemap(sitemap.body, origin);
    const urls = uniqueSameOrigin([startUrl, ...sitemapUrls], origin).slice(0, maxPages);

    return {
      method: sitemapUrls.length ? "sitemap.xml" : "fallback",
      sitemapUrl,
      urls: urls.length ? urls : [startUrl],
      totalDiscovered: sitemapUrls.length
    };
  } catch (error) {
    return {
      method: "fallback",
      sitemapUrl,
      urls: [startUrl],
      totalDiscovered: 0,
      error: error.message
    };
  }
}

async function extractUrlsFromSitemap(xml, origin) {
  if (!/<sitemapindex\b/i.test(xml)) {
    return parseSitemapUrls(xml, origin);
  }

  const sitemapUrls = parseSitemapUrls(xml, origin).slice(0, 5);
  const urls = [];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const sitemap = await fetchText(sitemapUrl);
      urls.push(...parseSitemapUrls(sitemap.body, origin));
    } catch {
      // Ignore individual sitemap failures and keep the crawl moving.
    }
  }

  return urls;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      status: response.status,
      body: await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseSitemapUrls(xml, origin) {
  const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);

  return locs.filter((url) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  });
}

function aggregateIssues(pages) {
  const grouped = new Map();

  for (const page of pages) {
    for (const issue of page.issues) {
      const key = [issue.area, issue.severity, issue.title, issue.fix, issue.validation].join("::");
      const existing = grouped.get(key);

      if (existing) {
        existing.affectedUrls.push(page.url);
        existing.examples.push(issue.evidence);
        existing.templates.add(inferTemplate(page.url));
      } else {
        grouped.set(key, {
          ...issue,
          affectedUrls: [page.url],
          examples: [issue.evidence],
          templates: new Set([inferTemplate(page.url)])
        });
      }
    }
  }

  return rankIssues(
    [...grouped.values()].map((issue) => ({
      ...issue,
      evidence: summarizeEvidence(issue),
      templates: [...issue.templates]
    }))
  );
}

function summarizeEvidence(issue) {
  const count = issue.affectedUrls.length;
  const example = issue.examples.find(Boolean) || "Observed during crawl.";
  return `${example} Affects ${count} URL${count === 1 ? "" : "s"}.`;
}

function failedPageAudit(url, error) {
  return {
    url,
    auditedAt: new Date().toISOString(),
    status: 0,
    facts: emptyFacts(),
    rendered: { ok: false, skipped: true, error: "Page audit failed." },
    renderComparison: { available: false, textGrowth: 0 },
    auditNotes: [`Page audit failed: ${error.message}`],
    issues: [
      {
        area: "crawlability",
        severity: "Critical",
        effort: "Medium",
        title: "URL could not be audited",
        evidence: error.message,
        fix: "Confirm the URL is reachable, returns HTML, and is not blocking the auditor user agent.",
        validation: "Retry the URL with curl and browser access, then rerun the audit."
      }
    ]
  };
}

function emptyFacts() {
  return {
    title: "",
    description: "",
    canonical: "",
    viewport: "",
    lang: "",
    h1s: [],
    jsonLd: [],
    hasRobotsTxt: false,
    hasSitemap: false,
    visibleTextLength: 0
  };
}

function inferTemplate(url) {
  const { pathname } = new URL(url);
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return "home";
  if (parts.some((part) => /^\d{4}$/.test(part))) return "article/date";
  if (parts.length === 1) return `${parts[0]} index`;
  if (parts.length >= 3) return `${parts[0]} detail`;
  return `${parts[0]} page`;
}

function uniqueSameOrigin(urls, origin) {
  const seen = new Set();
  const output = [];

  for (const url of urls) {
    try {
      const normalized = new URL(url).toString();
      if (new URL(normalized).origin !== origin || seen.has(normalized)) continue;
      seen.add(normalized);
      output.push(normalized);
    } catch {
      // Ignore invalid sitemap URLs.
    }
  }

  return output;
}

function rankIssues(issues) {
  const severityScore = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const effortScore = { Low: 0, Medium: 1, High: 2 };
  return issues.sort((a, b) => {
    return (
      severityScore[a.severity] - severityScore[b.severity] ||
      b.affectedUrls.length - a.affectedUrls.length ||
      effortScore[a.effort] - effortScore[b.effort] ||
      a.area.localeCompare(b.area)
    );
  });
}

function normalizeUrl(inputUrl) {
  try {
    return new URL(inputUrl).toString();
  } catch {
    return new URL(`https://${inputUrl}`).toString();
  }
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
