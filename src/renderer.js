const RENDER_TIMEOUT_MS = 20000;

export async function renderPage(url) {
  let playwright;

  try {
    playwright = await import("playwright");
  } catch (error) {
    return failedRender(`Playwright is not installed: ${error.message}`);
  }

  let browser;

  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844, isMobile: true },
      userAgent:
        "ConsultantSEOAuditor/0.1 Mobile Renderer (+https://github.com/ValtinaLab/consultant-seo-auditor)"
    });

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: RENDER_TIMEOUT_MS
    });

    const snapshot = await page.evaluate(() => {
      const h1s = [...document.querySelectorAll("h1")].map((node) => node.textContent.trim()).filter(Boolean);
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) =>
        node.textContent.trim()
      );

      return {
        html: document.documentElement.outerHTML,
        textLength: document.body?.innerText?.trim().length || 0,
        title: document.title,
        h1s,
        jsonLdCount: jsonLd.length,
        dataLayerLength: Array.isArray(window.dataLayer) ? window.dataLayer.length : null
      };
    });

    return {
      ok: true,
      skipped: false,
      ...snapshot
    };
  } catch (error) {
    return failedRender(error.message);
  } finally {
    if (browser) await browser.close();
  }
}

function failedRender(error) {
  return {
    ok: false,
    skipped: false,
    html: "",
    textLength: 0,
    title: "",
    h1s: [],
    error
  };
}
