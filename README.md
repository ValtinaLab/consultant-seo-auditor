# Consultant SEO Auditor

A lightweight CLI that audits a URL for technical SEO, analytics, schema, performance, trust, and security signals, then writes a consultant-style Markdown report.

This MVP uses Node's built-in fetch for static HTML analysis and an optional Playwright pass for rendered DOM checks. If Playwright is not installed, the CLI still runs and clearly marks rendered checks as unavailable.

## Usage

```bash
node src/cli.js https://example.com --out reports/example.md
```

Audit a small site from its sitemap:

```bash
node src/cli.js https://example.com --site --max-pages 25 --out reports/site-audit.md
```

Skip browser rendering:

```bash
node src/cli.js https://example.com --out reports/example.md --no-render
```

Enable rendered-DOM checks:

```bash
npm install
npx playwright install chromium
node src/cli.js https://example.com --out reports/example.md
```

The report includes:

- Executive summary with blockers and opportunities.
- Priority matrix from Critical to Low with effort estimates.
- Fix, validation, and tool guidance for each issue.
- Quick wins that can ship in under an hour.
- A 30-day action plan.
- Site mode with sitemap discovery, issue grouping, affected URLs, and template hints.

## Audit Areas

- Analytics and tracking: GA4, GTM, `dataLayer`.
- Rendering and JavaScript SEO: framework signals and static-render hints.
- Crawlability and indexability: robots, canonicals, hreflang, status.
- On-page technical: title, meta description, H1, language, RTL hints.
- Schema markup: JSON-LD, NewsArticle, BreadcrumbList, Author, Organization.
- Mobile and viewport: viewport tag and basic tap-target hints.
- Performance signals: render-blocking CSS, lazy loading, third-party scripts.
- Trust and quality: author/editorial signals.
- Security and foundations: HTTPS and suspicious script patterns.

## Roadmap

- Export HTML/PDF reports.
- Add Lighthouse/PageSpeed integrations.
- Add GitHub Actions workflow for scheduled audits.
