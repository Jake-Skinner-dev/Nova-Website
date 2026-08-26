#!/usr/bin/env node
// Generates a real static HTML page per Insights article
// (dist/insights/<slug>.html) from Supabase content, so each article has
// its own indexable URL, unique <title>/meta description and real
// (non-JS-rendered) body text for search engines and link previews.
//
// The insights-grid listing on insights.html keeps working exactly as
// before (client-side fetch from Supabase) — this script only adds a
// dedicated page per article alongside it.
//
// Runs after `vite build` (see package.json's "build" script). Articles
// added/edited via the admin panel show up in the listing instantly (no
// deploy needed, same as today) but their DEDICATED page is only
// generated/updated the next time this build runs and gets deployed.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { slugify } from "../src/slugify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "dist");

const SUPABASE_URL = "https://whtsdbhnnwxgqfubkmxp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodHNkYmhubnd4Z3FmdWJrbXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzcwMDUsImV4cCI6MjEwMjgxMzAwNX0.LnH5rJzxiaxjQjrC3PcnkQ-UA0KP0feGYdI0WqiOeXY";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphsHtml(body) {
  return String(body || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n        ");
}

async function main() {
  if (!existsSync(join(distDir, "insights.html"))) {
    console.error("dist/insights.html not found — run `vite build` first.");
    process.exit(1);
  }

  // Reuse the exact hashed asset tags Vite already produced for the other
  // pages, so these hand-built pages load the same CSS/JS bundle. Anchored
  // to "./assets/" so this doesn't accidentally match the Google Fonts
  // <link rel="stylesheet"> tag, which is also present on every page.
  const insightsHtml = readFileSync(join(distDir, "insights.html"), "utf-8");
  const cssMatch = insightsHtml.match(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+)"[^>]*>/);
  const jsMatch = insightsHtml.match(/<script type="module"[^>]*src="(\.\/assets\/[^"]+)"[^>]*><\/script>/);
  if (!cssMatch || !jsMatch) {
    console.error("Could not find built CSS/JS asset tags in dist/insights.html.");
    process.exit(1);
  }
  // These generated pages live one level deeper, at dist/insights/ — use
  // root-absolute paths instead of Vite's "./assets/..." so the nesting
  // depth doesn't matter.
  const cssAbs = "/" + cssMatch[1].slice(2);
  const jsAbs = "/" + jsMatch[1].slice(2);
  const cssTag = cssMatch[0].replace(cssMatch[1], cssAbs);
  const jsTag = jsMatch[0].replace(jsMatch[1], jsAbs);

  const header = readFileSync(join(root, "src/partials/header.html"), "utf-8");
  const footer = readFileSync(join(root, "src/partials/footer.html"), "utf-8");
  const modalContact = readFileSync(join(root, "src/partials/modal-contact.html"), "utf-8");
  const modalDiscovery = readFileSync(join(root, "src/partials/modal-discovery.html"), "utf-8");
  const ctaContact = readFileSync(join(root, "src/partials/cta-contact.html"), "utf-8");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: articles, error } = await supabase
    .from("articles")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Could not fetch articles from Supabase:", error.message);
    process.exit(1);
  }
  if (!articles || !articles.length) {
    console.log("No articles found in Supabase — skipping individual insight pages.");
    return;
  }

  const outDir = join(distDir, "insights");
  mkdirSync(outDir, { recursive: true });

  const usedSlugs = new Set();
  const sitemapUrls = [];

  for (const article of articles) {
    let slug = slugify(article.title);
    if (usedSlugs.has(slug)) slug = `${slug}-${String(article.id).replace(/[^a-z0-9]/gi, "").slice(0, 6)}`;
    usedSlugs.add(slug);

    const title = escapeHtml(article.title || "Insight");
    const description = escapeHtml(article.description || "");
    const category = escapeHtml(article.category || "INSIGHTS");
    const dateLabel = escapeHtml(article.date_label || "");
    const url = `https://www.novasocial.co.uk/insights/${slug}.html`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} | Nova Social Insights</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${url}" />

<!-- Open Graph -->
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Nova Social" />
<meta property="og:title" content="${title} | Nova Social Insights" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="https://www.novasocial.co.uk/assets/nova-logo-square.png" />
<meta property="og:locale" content="en_GB" />

<!-- Twitter -->
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${title} | Nova Social Insights" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="https://www.novasocial.co.uk/assets/nova-logo-square.png" />

<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#07080E" />

<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
${cssTag}
</head>
<body data-page="insights">
${header}

<main id="main-content">
  <div class="container">
    <section class="page-hero" data-reveal>
      <div class="eyebrow-rule">
        <span class="eyebrow">${category}</span>
        <span class="rule"></span>
      </div>
      <h1 class="section-title">${title}</h1>
      <p class="section-lede">${description}</p>
    </section>

    <section data-reveal>
      <div class="article-meta" style="margin-bottom:20px;">
        <span>${dateLabel}</span>
      </div>
      <div class="article-divider"></div>
      <div class="article-body" style="max-width:720px;">
        ${paragraphsHtml(article.body)}
      </div>
      <p style="margin-top:8px;"><a href="/insights.html" class="service-link">&larr; Back to Insights</a></p>
    </section>

    ${ctaContact}
  </div>
</main>

${footer}
${modalContact}
${modalDiscovery}

${jsTag}
</body>
</html>
`;

    writeFileSync(join(outDir, `${slug}.html`), html, "utf-8");
    sitemapUrls.push(
      `  <url>\n    <loc>${url}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
    );
  }

  const sitemapPath = join(distDir, "sitemap.xml");
  if (existsSync(sitemapPath)) {
    let sitemap = readFileSync(sitemapPath, "utf-8");
    sitemap = sitemap.replace("</urlset>", sitemapUrls.join("\n") + "\n</urlset>\n");
    writeFileSync(sitemapPath, sitemap, "utf-8");
  }

  console.log(`Generated ${articles.length} insight page(s) in dist/insights/.`);
}

main();
