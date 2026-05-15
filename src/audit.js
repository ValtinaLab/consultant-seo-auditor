const USER_AGENT =
  "ConsultantSEOAuditor/0.1 (+https://github.com/your-org/consultant-seo-auditor)";

const CHECK_TIMEOUT_MS = 15000;

export async function runAudit(inputUrl) {
  const url = normalizeUrl(inputUrl);
  const startedAt = new Date();
  const page = await fetchText(url);
  const origin = new URL(url).origin;

  const [robots, sitemap] = await Promise.allSettled([
    fetchText(`${origin}/robots.txt`),
    fetchText(`${origin}/sitemap.xml`)
  ]);

  const context = {
    url,
    origin,
    startedAt,
    status: page.status,
    headers: page.headers,
    html: page.body,
    robots: fulfilledBody(robots),
    sitemap: fulfilledBody(sitemap)
  };

  const facts = collectFacts(context);
  const issues = [
    ...checkAnalytics(context, facts),
    ...checkRendering(context, facts),
    ...checkIndexability(context, facts),
    ...checkOnPage(context, facts),
    ...checkSchema(context, facts),
    ...checkMobile(context, facts),
    ...checkPerformance(context, facts),
    ...checkTrust(context, facts),
    ...checkSecurity(context, facts)
  ];

  return {
    url,
    auditedAt: startedAt.toISOString(),
    status: page.status,
    facts,
    issues: rankIssues(issues)
  };
}

function normalizeUrl(inputUrl) {
  try {
    return new URL(inputUrl).toString();
  } catch {
    return new URL(`https://${inputUrl}`).toString();
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow"
    });

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fulfilledBody(result) {
  return result.status === "fulfilled" ? result.value.body : "";
}

function collectFacts(context) {
  const { html, robots, sitemap } = context;
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaContent(html, "description");
  const robotsMeta = metaContent(html, "robots");
  const canonical = linkHref(html, "canonical");
  const viewport = metaContent(html, "viewport");
  const lang = firstMatch(html, /<html[^>]+lang=["']?([^"'\s>]+)/i);
  const dir = firstMatch(html, /<html[^>]+dir=["']?([^"'\s>]+)/i);
  const h1s = allMatches(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi).map((match) => stripTags(match[1]));
  const scripts = allMatches(html, /<script\b([^>]*)>([\s\S]*?)<\/script>/gi).map((match) => ({
    attrs: match[1],
    body: match[2],
    src: attr(match[1], "src")
  }));
  const links = allMatches(html, /<link\b([^>]*)>/gi).map((match) => ({
    attrs: match[1],
    rel: attr(match[1], "rel"),
    href: attr(match[1], "href"),
    hreflang: attr(match[1], "hreflang")
  }));
  const jsonLd = scripts
    .filter((script) => /type=["']application\/ld\+json["']/i.test(script.attrs))
    .map((script) => parseJsonLd(script.body))
    .filter(Boolean);
  const visibleText = stripTags(html).replace(/\s+/g, " ").trim();
  const imageCount = count(html, /<img\b/gi);
  const lazyImages = count(html, /<img\b[^>]*loading=["']lazy["']/gi);

  return {
    title: cleanText(title),
    description: cleanText(description),
    robotsMeta: cleanText(robotsMeta),
    canonical,
    viewport,
    lang,
    dir,
    h1s,
    scripts,
    links,
    jsonLd,
    hasRobotsTxt: robots.length > 0 && !/^404\b/i.test(robots),
    hasSitemap: sitemap.length > 0 && /<urlset|<sitemapindex/i.test(sitemap),
    visibleTextLength: visibleText.length,
    imageCount,
    lazyImages,
    frameworkSignals: {
      next: /__NEXT_DATA__|\/_next\//i.test(html),
      nuxt: /__NUXT__|\/_nuxt\//i.test(html),
      react: /data-reactroot|react/i.test(html),
      vue: /data-v-|vue/i.test(html)
    }
  };
}

function checkAnalytics(_context, facts) {
  const scriptText = facts.scripts.map((script) => `${script.src || ""} ${script.body}`).join("\n");
  const issues = [];
  const hasGtm = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i.test(scriptText);
  const hasGa4 = /googletagmanager\.com\/gtag\/js|G-[A-Z0-9]+|gtag\(/i.test(scriptText);
  const hasDataLayer = /dataLayer/i.test(scriptText);

  if (!hasGtm && !hasGa4) {
    issues.push(issue("analytics", "Critical", "Medium", "No GA4 or GTM tag detected", "Analytics coverage appears absent from the static HTML.", "Install GTM or GA4 directly, then define a tracking plan for page views, consent, and key conversions.", "Use GA4 DebugView, Tag Assistant, and browser network requests to verify events."));
  }

  if ((hasGtm || hasGa4) && !hasDataLayer) {
    issues.push(issue("analytics", "Medium", "Low", "Tracking exists but no dataLayer signal was found", "The page has analytics tags, but no obvious structured event layer.", "Add a normalized dataLayer contract for page metadata and conversion events.", "Use Tag Assistant and inspect window.dataLayer after page load."));
  }

  return issues;
}

function checkRendering(_context, facts) {
  const issues = [];
  const hasJsFramework = Object.values(facts.frameworkSignals).some(Boolean);

  if (hasJsFramework && facts.visibleTextLength < 800) {
    issues.push(issue("rendering", "High", "Medium", "JavaScript framework with thin static content", "The HTML shows framework signals but limited readable content before JavaScript execution.", "Validate SSR or pre-rendering for the main content, title, links, and schema.", "Compare view-source HTML against rendered DOM with Playwright or Google Rich Results Test."));
  }

  return issues;
}

function checkIndexability(context, facts) {
  const issues = [];

  if (context.status >= 400) {
    issues.push(issue("indexability", "Critical", "Low", `Page returns HTTP ${context.status}`, "Search engines may be unable to index the URL.", "Serve a 200 status for indexable content or redirect to the canonical equivalent.", "Validate with curl, Search Console URL Inspection, and server logs."));
  }

  if (/noindex/i.test(facts.robotsMeta)) {
    issues.push(issue("indexability", "Critical", "Low", "Meta robots contains noindex", "The page explicitly asks search engines not to index it.", "Remove noindex if the page should rank, or keep it only for intentionally excluded pages.", "Inspect rendered meta robots and verify with Search Console URL Inspection."));
  }

  if (!facts.canonical) {
    issues.push(issue("indexability", "High", "Low", "Missing canonical URL", "Canonical consolidation is unclear.", "Add a self-referencing canonical on indexable pages.", "Check the rendered head and crawl output."));
  }

  if (!facts.hasRobotsTxt) {
    issues.push(issue("indexability", "Medium", "Low", "robots.txt was not found", "Crawlers lack a central crawl policy file.", "Publish a robots.txt that references the XML sitemap and avoids blocking critical assets.", "Open /robots.txt and test with Search Console robots tester."));
  }

  if (!facts.hasSitemap) {
    issues.push(issue("indexability", "Medium", "Medium", "XML sitemap was not found", "Discovery and freshness signals may be weaker.", "Publish a valid XML sitemap and reference it from robots.txt.", "Validate /sitemap.xml and submit it in Search Console."));
  }

  return issues;
}

function checkOnPage(_context, facts) {
  const issues = [];

  if (!facts.title) {
    issues.push(issue("on-page", "High", "Low", "Missing title tag", "The page has no static title tag.", "Add a unique, descriptive title aligned to the page intent.", "Inspect source and rendered DOM."));
  } else if (facts.title.length < 20 || facts.title.length > 65) {
    issues.push(issue("on-page", "Medium", "Low", "Title length is outside the usual search snippet range", `Current title length is ${facts.title.length} characters.`, "Rewrite the title to be specific and concise, usually around 35-60 characters.", "Check SERP preview tools and crawl exports."));
  }

  if (!facts.description) {
    issues.push(issue("on-page", "Medium", "Low", "Missing meta description", "The page lacks a static description for snippet guidance.", "Add a concise description that explains the page value and intent.", "Inspect source and rendered DOM."));
  }

  if (facts.h1s.length === 0) {
    issues.push(issue("on-page", "High", "Low", "Missing H1", "No primary heading was found in static HTML.", "Add one visible H1 that matches the page purpose.", "Check rendered DOM and accessibility tree."));
  } else if (facts.h1s.length > 1) {
    issues.push(issue("on-page", "Low", "Low", "Multiple H1 elements found", `${facts.h1s.length} H1 elements were found.`, "Confirm the heading hierarchy is intentional and not template duplication.", "Review rendered headings in a crawler or browser inspector."));
  }

  if (!facts.lang) {
    issues.push(issue("on-page", "Medium", "Low", "Missing html lang attribute", "Language targeting and accessibility signals are incomplete.", "Add the correct lang attribute to the html element.", "Inspect the html element and validate accessibility output."));
  }

  return issues;
}

function checkSchema(_context, facts) {
  const issues = [];
  const schemaTypes = new Set(flattenSchemaTypes(facts.jsonLd));

  if (facts.jsonLd.length === 0) {
    issues.push(issue("schema", "Medium", "Medium", "No JSON-LD schema detected", "Structured data opportunities are currently unused.", "Add schema that matches the page type, such as Article, NewsArticle, BreadcrumbList, Organization, or Person.", "Validate with Rich Results Test and Schema.org validator."));
  }

  if (schemaTypes.has("NewsArticle") && !schemaTypes.has("BreadcrumbList")) {
    issues.push(issue("schema", "Medium", "Low", "NewsArticle schema lacks BreadcrumbList support", "Article context can be strengthened with navigational structured data.", "Add BreadcrumbList JSON-LD that reflects the visible breadcrumb path.", "Validate with Rich Results Test."));
  }

  if ((schemaTypes.has("Article") || schemaTypes.has("NewsArticle")) && !hasAuthorSchema(facts.jsonLd)) {
    issues.push(issue("schema", "High", "Medium", "Article schema lacks clear author entity", "Author and E-E-A-T signals are weaker.", "Add an author Person or Organization entity with profile URL and sameAs where appropriate.", "Validate JSON-LD and check author page availability."));
  }

  return issues;
}

function checkMobile(_context, facts) {
  const issues = [];

  if (!facts.viewport) {
    issues.push(issue("mobile", "High", "Low", "Missing viewport meta tag", "Mobile browsers may render the page with an unsuitable desktop layout.", "Add a responsive viewport tag.", "Inspect rendered head and test mobile viewport in DevTools."));
  } else if (!/width\s*=\s*device-width/i.test(facts.viewport)) {
    issues.push(issue("mobile", "Medium", "Low", "Viewport does not use device-width", "Responsive behavior may be inconsistent.", "Use width=device-width and an appropriate initial-scale.", "Test common mobile widths in DevTools."));
  }

  if (facts.dir === "rtl" && !/dir=["']rtl["']/i.test(facts.links.map((link) => link.attrs).join(" "))) {
    issues.push(issue("mobile", "Low", "Medium", "RTL page should be visually checked on mobile", "The document is RTL, which often exposes spacing and tap-target issues.", "Run a rendered mobile audit for navigation, forms, and horizontal overflow.", "Use Playwright screenshots and Lighthouse mobile."));
  }

  return issues;
}

function checkPerformance(_context, facts) {
  const issues = [];
  const stylesheets = facts.links.filter((link) => /\bstylesheet\b/i.test(link.rel || ""));
  const thirdPartyScripts = facts.scripts.filter((script) => script.src && isThirdParty(script.src));

  if (stylesheets.length > 6) {
    issues.push(issue("performance", "Medium", "Medium", "High number of render-blocking stylesheets", `${stylesheets.length} stylesheet links were found.`, "Inline critical CSS, consolidate styles, and defer non-critical CSS where safe.", "Use Lighthouse, WebPageTest, and Chrome Coverage."));
  }

  if (facts.imageCount > 5 && facts.lazyImages === 0) {
    issues.push(issue("performance", "Medium", "Low", "Images are not using native lazy loading", `${facts.imageCount} images were found and none use loading=lazy.`, "Lazy-load below-the-fold images and keep hero imagery eager.", "Validate in DevTools network waterfall and Lighthouse."));
  }

  if (thirdPartyScripts.length > 8) {
    issues.push(issue("performance", "High", "Medium", "Heavy third-party script footprint", `${thirdPartyScripts.length} external third-party scripts were found.`, "Audit script ownership, remove unused vendors, and defer non-critical tags through GTM governance.", "Use Lighthouse third-party summary and Chrome Performance panel."));
  }

  return issues;
}

function checkTrust(_context, facts) {
  const issues = [];
  const htmlSignals = `${facts.title} ${facts.description} ${facts.h1s.join(" ")}`;
  const hasAuthorText = /author|byline|editor|editorial|reviewed by|escrito por|autor/i.test(htmlSignals);

  if (!hasAuthorSchema(facts.jsonLd) && !hasAuthorText) {
    issues.push(issue("trust", "Medium", "Medium", "No obvious author or editorial signal detected", "Users and search engines may lack clarity on who is responsible for the content.", "Add visible author/editorial information and connect it to an author profile where relevant.", "Review rendered page, schema, and internal author URLs."));
  }

  return issues;
}

function checkSecurity(context, facts) {
  const issues = [];
  const url = new URL(context.url);
  const scriptText = facts.scripts.map((script) => `${script.src || ""} ${script.body}`).join("\n");

  if (url.protocol !== "https:") {
    issues.push(issue("security", "Critical", "Medium", "URL is not served over HTTPS", "The page is exposed over an insecure protocol.", "Redirect HTTP to HTTPS and enforce secure canonical URLs.", "Validate with curl and browser security panel."));
  }

  if (!context.headers["content-security-policy"]) {
    issues.push(issue("security", "Low", "Medium", "No Content-Security-Policy header detected", "The site has less protection against script injection.", "Add a monitored CSP, then tighten allowed script and connection sources.", "Check response headers and CSP violation reports."));
  }

  if (/eval\(|document\.write\(|atob\(|fromCharCode|unescape\(/i.test(scriptText)) {
    issues.push(issue("security", "High", "Medium", "Suspicious JavaScript patterns detected", "The page includes patterns often associated with brittle or risky scripts.", "Review script ownership and replace unsafe dynamic execution where possible.", "Inspect source maps, vendor list, and browser security tooling."));
  }

  return issues;
}

function issue(area, severity, effort, title, evidence, fix, validation) {
  return { area, severity, effort, title, evidence, fix, validation };
}

function rankIssues(issues) {
  const severityScore = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const effortScore = { Low: 0, Medium: 1, High: 2 };
  return issues.sort((a, b) => {
    return (
      severityScore[a.severity] - severityScore[b.severity] ||
      effortScore[a.effort] - effortScore[b.effort] ||
      a.area.localeCompare(b.area)
    );
  });
}

function firstMatch(text, regex) {
  const match = regex.exec(text);
  return match ? stripTags(match[1]) : "";
}

function allMatches(text, regex) {
  return [...text.matchAll(regex)];
}

function metaContent(html, name) {
  const escaped = escapeRegExp(name);
  const patterns = [
    new RegExp(`<meta\\b(?=[^>]*\\bname=["']${escaped}["'])([^>]+)>`, "i"),
    new RegExp(`<meta\\b(?=[^>]*\\bproperty=["']${escaped}["'])([^>]+)>`, "i")
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return attr(match[1], "content");
  }

  return "";
}

function linkHref(html, rel) {
  const match = new RegExp(`<link\\b(?=[^>]*\\brel=["'][^"']*${escapeRegExp(rel)}[^"']*["'])([^>]+)>`, "i").exec(html);
  return match ? attr(match[1], "href") : "";
}

function attr(attrs, name) {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attrs || "");
  return match ? match[1].trim() : "";
}

function stripTags(text) {
  return (text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(text) {
  return stripTags(text).replace(/\s+/g, " ").trim();
}

function count(text, regex) {
  return allMatches(text, regex).length;
}

function parseJsonLd(source) {
  try {
    return JSON.parse(source.trim());
  } catch {
    return null;
  }
}

function flattenSchemaTypes(entries) {
  const types = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node["@type"]) {
      if (Array.isArray(node["@type"])) types.push(...node["@type"]);
      else types.push(node["@type"]);
    }
    if (node["@graph"]) visit(node["@graph"]);
  };

  entries.forEach(visit);
  return types;
}

function hasAuthorSchema(entries) {
  return JSON.stringify(entries).toLowerCase().includes('"author"');
}

function isThirdParty(src) {
  return /^https?:\/\//i.test(src);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
