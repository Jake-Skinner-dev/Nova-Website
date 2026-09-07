#!/usr/bin/env node
/**
 * Nova Brief — static page generator. Runs after `vite build` (see
 * package.json "build"). Turns published Supabase content into real,
 * individually-SEO'd static files:
 *
 *   dist/<slug>.html            one editorial page per published article
 *   dist/<section>.html         section landings, populated (overwrites
 *                               Vite's dev shells)
 *   dist/brands/<slug>.html     a page per brand that has published stories
 *   dist/sitemap.xml            home + sections + articles + brands
 *   dist/rss.xml                latest 20 published articles
 *
 * Nothing here talks to the admin or moves anything through the workflow —
 * it only reads rows already marked status = 'published'. Articles
 * published in the admin appear on the site the next time this build runs
 * and deploys (same model as the parent site's Insights pages).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { slugify } from "../src/slugify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "dist");
const SITE = "https://brief.novasocial.co.uk";

const SUPABASE_URL = "https://whtsdbhnnwxgqfubkmxp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodHNkYmhubnd4Z3FmdWJrbXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzcwMDUsImV4cCI6MjEwMjgxMzAwNX0.LnH5rJzxiaxjQjrC3PcnkQ-UA0KP0feGYdI0WqiOeXY";

const SECTIONS = [
  { slug: "news", name: "News", category: "News", blurb: "Fast-moving marketing industry stories — moves, launches, results and rule changes." },
  { slug: "campaigns", name: "Campaigns", category: "Campaigns", blurb: "Brand campaigns and advertising worth a proper look — the idea, the spend and whether it works." },
  { slug: "social", name: "Social", category: "Social", blurb: "Platforms, formats and what is actually changing for social teams." },
  { slug: "brand", name: "Brand", category: "Branding", blurb: "Branding, positioning and the distinctive assets that make brands easy to buy." },
  { slug: "digital", name: "Digital", category: "Digital", blurb: "Search, retail media, data, privacy and martech." },
  { slug: "ai", name: "AI", category: "AI", blurb: "What AI actually changes for marketers — and what it does not." },
  { slug: "advertising", name: "Advertising", category: "Advertising", blurb: "Ads, media and the money behind them." },
  { slug: "agencies", name: "Agencies", category: "Agencies", blurb: "Account moves, new business and how agencies are really working." },
  { slug: "stats", name: "Stats", category: "Stats", blurb: "The marketing numbers worth remembering, with the context around them." }
];

/* ------------------------------------------------------------------ utils */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function attr(str) {
  return esc(str).replace(/'/g, "&#39;");
}
function fmtDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v ?? "")
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function isoDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
const kickerClass = (c) => "kicker--" + slugify(c || "news").replace(/-.*$/, "");
const chipClass = (c) => "chip--" + slugify(c || "news").replace(/-.*$/, "");
function readMinutes(a) {
  if (a.reading_minutes) return a.reading_minutes;
  const words = String(a.body || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Inline: **bold** and [label](https://url) — escape first, then wrap.
function inlineHtml(text) {
  let s = esc(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  return s;
}

// Body text → HTML. Convention shared with src/article.js and documented
// in brief/README.md.
function parseBody(raw) {
  const blocks = String(raw || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const out = [];
  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;
    if (block.startsWith("## ")) {
      out.push(`<h2>${esc(block.slice(3).trim())}</h2>`);
    } else if (block.startsWith("### ")) {
      out.push(`<h3>${esc(block.slice(4).trim())}</h3>`);
    } else if (block.startsWith("> ")) {
      out.push(`<blockquote class="pullquote">${inlineHtml(block.replace(/^>\s?/gm, "").trim())}</blockquote>`);
    } else if (/^\[\[stat:/i.test(block)) {
      const inner = block.replace(/^\[\[stat:\s*/i, "").replace(/\]\]$/, "");
      const [value, caption, src] = inner.split("|").map((s) => (s || "").trim());
      out.push(
        `<div class="inline-stat"><span class="is-num">${esc(value)}</span>` +
          (caption ? `<span class="is-cap">${esc(caption)}</span>` : "") +
          (src ? `<span class="is-cap"><a href="${attr(src)}" target="_blank" rel="noopener">Source</a></span>` : "") +
          `</div>`
      );
    } else if (block.split("\n").every((l) => /^[-*]\s+/.test(l))) {
      const items = block
        .split("\n")
        .map((l) => `<li>${inlineHtml(l.replace(/^[-*]\s+/, ""))}</li>`)
        .join("");
      out.push(`<ul>${items}</ul>`);
    } else {
      out.push(`<p>${inlineHtml(block)}</p>`);
    }
  }
  return out.join("\n        ");
}

/* -------------------------------------------------- built asset tags */
function assetTags() {
  const idx = readFileSync(join(distDir, "index.html"), "utf-8");
  const css = idx.match(/<link[^>]+rel="stylesheet"[^>]+href="(\.\/assets\/[^"]+\.css)"[^>]*>/);
  const js = idx.match(/<script[^>]+type="module"[^>]+src="(\.\/assets\/[^"]+\.js)"[^>]*><\/script>/);
  const preloads = [...idx.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="(\.\/assets\/[^"]+)"[^>]*>/g)];
  if (!css || !js) {
    console.error("generate-articles: could not find built CSS/JS tags in dist/index.html. Run `vite build` first.");
    process.exit(1);
  }
  const abs = (p) => "/" + p.slice(2); // "./assets/x" -> "/assets/x"
  return {
    css: `<link rel="stylesheet" href="${abs(css[1])}" />`,
    js: `<script type="module" src="${abs(js[1])}"></script>`,
    preloads: preloads.map((m) => `<link rel="modulepreload" href="${abs(m[1])}" />`).join("\n")
  };
}

/* -------------------------------------------------- partials + shell */
const P = (name) => readFileSync(join(root, "src/partials", `${name}.html`), "utf-8");

function buildShell({ headCommon, tags, header, footer }, { title, description, canonical, headExtra = "", bodyAttrs = "", inner }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}" />
<link rel="canonical" href="${attr(canonical)}" />
${headExtra}
${headCommon}
${tags.preloads}
</head>
<body ${bodyAttrs}>
${header}
${inner}
${footer}
${tags.js}
</body>
</html>
`;
}

/* -------------------------------------------------- page bodies */
function articleInner(a, related) {
  const cat = a.category || "News";
  const mins = readMinutes(a);
  const hero = a.featured_image_url
    ? `<figure class="article-hero"><img src="${attr(a.featured_image_url)}" alt="${attr(a.featured_image_alt || "")}" />${
        a.featured_image_alt ? `<figcaption>${esc(a.featured_image_alt)}</figcaption>` : ""
      }</figure>`
    : "";
  const novaTake = a.nova_take
    ? `<aside class="article-aside nova-take-box"><div class="aside-label nt-label">The Nova Take</div><p>${esc(a.nova_take)}</p></aside>`
    : "";
  const source =
    a.source_name || a.source_url
      ? `<p class="article-source">Source: ${
          a.source_url
            ? `<a href="${attr(a.source_url)}" target="_blank" rel="noopener">${esc(a.source_name || a.source_url)}</a>`
            : esc(a.source_name)
        }</p>`
      : "";
  const tags =
    Array.isArray(a.tags) && a.tags.length
      ? `<div class="article-tags">${a.tags
          .map((t) => `<a class="chip" href="/search.html?q=${encodeURIComponent(t)}">${esc(t)}</a>`)
          .join("")}</div>`
      : "";
  const sponsored = a.is_sponsored
    ? `<span class="dot"></span><span>Sponsored${a.sponsor_name ? ` · ${esc(a.sponsor_name)}` : ""}</span>`
    : "";
  const relatedBlock = related.length
    ? `<div class="container container--narrow"><p class="section-label">Related</p><div class="related">${related
        .map(
          (r) =>
            `<div class="related-card"><span class="kicker ${kickerClass(r.category)}">${esc(
              r.category || "News"
            )}</span><h3><a href="/${r.slug}.html">${esc(r.headline)}</a></h3></div>`
        )
        .join("")}</div></div>`
    : "";

  return `<div class="read-progress" id="read-progress"></div>
<main id="main">
  <div class="container container--narrow">
    <article class="article-wrap">
      <div class="article-head">
        <a class="kicker ${kickerClass(cat)}" href="/${slugify(cat).replace(/-.*$/, "")}.html">${esc(cat)}</a>
        <h1>${esc(a.headline)}</h1>
        ${a.standfirst ? `<p class="standfirst">${esc(a.standfirst)}</p>` : ""}
      </div>
      <div class="article-byline">
        By <strong>${esc(a.author || "Nova Brief")}</strong>
        <span class="dot"></span><span>${esc(fmtDate(a.published_at))}</span>
        <span class="dot"></span><span>${mins} min read</span>
        ${sponsored}
      </div>
      ${hero}
      <div class="article-body">
        ${parseBody(a.body)}
      </div>
      ${novaTake}
      ${source}
      ${tags}
    </article>
  </div>
  ${relatedBlock}
  ${newsletterCta}
  ${novaSocialCta}
</main>`;
}

function listingInner({ name, blurb, slug }, rows) {
  const chips = SECTIONS.map(
    (s) =>
      `<a class="chip ${chipClass(s.category)}${s.slug === slug ? " is-active" : ""}" href="/${s.slug}.html">${esc(s.name)}</a>`
  ).join("");
  const list = rows.length
    ? rows.map((a) => briefRowHtml(a)).join("\n        ")
    : `<p class="meta-line">No published stories in this section yet.</p>`;
  return `<main id="main">
  <div class="container">
    <div class="listing-head">
      <span class="kicker ${kickerClass(name)}">Section</span>
      <h1>${esc(name)}</h1>
      <p>${esc(blurb)}</p>
      <div class="chip-row">${chips}</div>
    </div>
    <section>
      <div class="daily-brief-list" id="section-list">
        ${list}
      </div>
    </section>
  </div>
  ${newsletterCta}
  ${novaSocialCta}
</main>`;
}

function briefRowHtml(a) {
  const cat = a.category || "News";
  const media = a.featured_image_url
    ? `<a class="brief-row-media" href="/${a.slug}.html" aria-hidden="true"><img src="${attr(a.featured_image_url)}" alt="${attr(a.featured_image_alt || "")}" loading="lazy" /></a>`
    : "";
  return `<article class="brief-row${a.featured_image_url ? "" : " no-media"}">
          <div class="brief-row-body">
            <span class="kicker ${kickerClass(cat)}">${esc(cat)}</span>
            <h3><a href="/${a.slug}.html">${esc(a.headline)}</a></h3>
            ${a.standfirst ? `<p>${esc(a.standfirst)}</p>` : ""}
            <div class="meta-line"><span>${esc(fmtDate(a.published_at))}</span><span class="dot"></span><span>${readMinutes(a)} min read</span></div>
          </div>
          ${media}
        </article>`;
}

function brandInner(brand, rows) {
  return `<main id="main">
  <div class="container">
    <div class="listing-head">
      <span class="kicker kicker--plain">Brand</span>
      <h1>${esc(brand.name)}</h1>
      ${brand.blurb ? `<p>${esc(brand.blurb)}</p>` : `<p>Every Nova Brief story that mentions ${esc(brand.name)}.</p>`}
    </div>
    <section>
      <div class="daily-brief-list">
        ${rows.map((a) => briefRowHtml(a)).join("\n        ")}
      </div>
    </section>
  </div>
  ${newsletterCta}
  ${novaSocialCta}
</main>`;
}

function articleJsonLd(a) {
  const url = `${SITE}/${a.slug}.html`;
  const img = a.social_image_url || a.featured_image_url || `${SITE}/og-default.png`;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": a.is_sponsored ? "Article" : "NewsArticle",
    headline: a.headline,
    description: a.meta_description || a.standfirst || "",
    image: [img],
    datePublished: isoDate(a.published_at),
    dateModified: isoDate(a.modified_at || a.updated_at || a.published_at),
    author: { "@type": "Person", name: a.author || "Nova Brief" },
    publisher: {
      "@type": "Organization",
      name: "Nova Brief",
      url: SITE,
      parentOrganization: { "@type": "Organization", name: "Nova Social", url: "https://novasocial.co.uk" }
    },
    articleSection: a.category || "News",
    keywords: Array.isArray(a.tags) ? a.tags.join(", ") : undefined,
    isAccessibleForFree: true,
    mainEntityOfPage: { "@type": "WebPage", "@id": url }
  });
}
function breadcrumbJsonLd(a) {
  const secSlug = slugify(a.category || "news").replace(/-.*$/, "");
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Nova Brief", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: a.category || "News", item: `${SITE}/${secSlug}.html` },
      { "@type": "ListItem", position: 3, name: a.headline, item: `${SITE}/${a.slug}.html` }
    ]
  });
}

/* ------------------------------------------------------------------ main */
let newsletterCta = "";
let novaSocialCta = "";

async function main() {
  if (!existsSync(join(distDir, "index.html"))) {
    console.error("generate-articles: dist/ not found — run `vite build` first.");
    process.exit(1);
  }

  const tags = assetTags();
  const headCommonRaw = P("head-common");
  const headCommon = headCommonRaw.replace('<link rel="stylesheet" href="/src/style.css" />', tags.css);
  const header = P("header");
  const footer = P("footer");
  newsletterCta = P("newsletter-cta");
  novaSocialCta = P("nova-social-cta");
  const shellCtx = { headCommon, tags, header, footer };

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const nowIso = new Date().toISOString();
  const { data: articles, error } = await supabase
    .from("brief_articles")
    .select("*")
    .eq("status", "published")
    .lte("published_at", nowIso)
    .order("published_at", { ascending: false });
  if (error) {
    if (/schema cache|does not exist|Could not find the table/i.test(error.message)) {
      console.warn(
        "generate-articles: brief_* tables not found — run brief-supabase-setup.sql in Supabase, then rebuild.\n" +
          "  Skipping article / section / sitemap / RSS generation. The Vite output (homepage + section shells) is still usable."
      );
      process.exitCode = 0;
      return;
    }
    console.error("generate-articles: Supabase query failed:", error.message);
    process.exitCode = 1;
    return;
  }

  const sitemap = [`${SITE}/`, ...SECTIONS.map((s) => `${SITE}/${s.slug}.html`), `${SITE}/about.html`, `${SITE}/newsletter.html`];

  /* ---- articles ---- */
  const used = new Set();
  let count = 0;
  for (const a of articles || []) {
    let slug = a.slug || slugify(a.headline);
    if (used.has(slug)) slug = `${slug}-${String(a.id).replace(/[^a-z0-9]/gi, "").slice(0, 6)}`;
    used.add(slug);
    a.slug = slug;

    const related = (articles || [])
      .filter((r) => r.slug !== a.slug && (r.category || "") === (a.category || ""))
      .slice(0, 3);

    const url = `${SITE}/${slug}.html`;
    const img = a.social_image_url || a.featured_image_url || `${SITE}/og-default.png`;
    const desc = a.meta_description || a.standfirst || "";
    const headExtra = `<meta name="robots" content="index, follow" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Nova Brief" />
<meta property="og:title" content="${attr(a.seo_title || a.headline)}" />
<meta property="og:description" content="${attr(desc)}" />
<meta property="og:url" content="${attr(url)}" />
<meta property="og:image" content="${attr(img)}" />
<meta property="og:locale" content="en_GB" />
<meta property="article:published_time" content="${isoDate(a.published_at)}" />
<meta property="article:modified_time" content="${isoDate(a.modified_at || a.updated_at || a.published_at)}" />
<meta property="article:section" content="${attr(a.category || "News")}" />
${(a.tags || []).map((t) => `<meta property="article:tag" content="${attr(t)}" />`).join("\n")}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${attr(a.seo_title || a.headline)}" />
<meta name="twitter:description" content="${attr(desc)}" />
<meta name="twitter:image" content="${attr(img)}" />
<script type="application/ld+json">${articleJsonLd(a)}</script>
<script type="application/ld+json">${breadcrumbJsonLd(a)}</script>`;

    const html = buildShell(shellCtx, {
      title: `${a.seo_title || a.headline} | Nova Brief`,
      description: desc,
      canonical: url,
      headExtra,
      bodyAttrs: `data-page="article" data-section="${slugify(a.category || "news").replace(/-.*$/, "")}"`,
      inner: articleInner(a, related)
    });
    writeFileSync(join(distDir, `${slug}.html`), html, "utf-8");
    sitemap.push(url);
    count++;
  }

  /* ---- section landings ---- */
  for (const s of SECTIONS) {
    const rows = (articles || []).filter(
      (a) => (a.category || "").toLowerCase() === s.category.toLowerCase()
    );
    const html = buildShell(shellCtx, {
      title: `${s.name} | Nova Brief`,
      description: s.blurb,
      canonical: `${SITE}/${s.slug}.html`,
      headExtra: `<meta name="robots" content="index, follow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Nova Brief" />
<meta property="og:title" content="${attr(s.name)} | Nova Brief" />
<meta property="og:description" content="${attr(s.blurb)}" />
<meta property="og:url" content="${SITE}/${s.slug}.html" />
<meta property="og:image" content="${SITE}/og-default.png" />
<meta name="twitter:card" content="summary_large_image" />`,
      bodyAttrs: `data-page="section-static" data-section="${s.slug}"`,
      inner: listingInner(s, rows)
    });
    writeFileSync(join(distDir, `${s.slug}.html`), html, "utf-8");
  }

  /* ---- brand pages ---- */
  const brandMap = new Map();
  for (const a of articles || []) {
    if (!a.brand) continue;
    const key = slugify(a.brand);
    if (!brandMap.has(key)) brandMap.set(key, { slug: key, name: a.brand, blurb: "", rows: [] });
    brandMap.get(key).rows.push(a);
  }
  const { data: brandRows } = await supabase.from("brief_brands").select("*");
  for (const b of brandRows || []) {
    const key = b.slug || slugify(b.name);
    if (brandMap.has(key)) {
      brandMap.get(key).name = b.name || brandMap.get(key).name;
      brandMap.get(key).blurb = b.blurb || "";
    }
  }
  if (brandMap.size) {
    mkdirSync(join(distDir, "brands"), { recursive: true });
    for (const b of brandMap.values()) {
      const html = buildShell(shellCtx, {
        title: `${b.name} — marketing news | Nova Brief`,
        description: b.blurb || `Nova Brief stories about ${b.name}.`,
        canonical: `${SITE}/brands/${b.slug}.html`,
        headExtra: `<meta name="robots" content="index, follow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Nova Brief" />
<meta property="og:title" content="${attr(b.name)} — marketing news | Nova Brief" />
<meta property="og:url" content="${SITE}/brands/${b.slug}.html" />
<meta property="og:image" content="${SITE}/og-default.png" />`,
        bodyAttrs: `data-page="brand"`,
        inner: brandInner(b, b.rows)
      });
      writeFileSync(join(distDir, "brands", `${b.slug}.html`), html, "utf-8");
      sitemap.push(`${SITE}/brands/${b.slug}.html`);
    }
  }

  /* ---- sitemap.xml ---- */
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap
  .map(
    (u) =>
      `  <url><loc>${esc(u)}</loc><changefreq>${u === SITE + "/" ? "daily" : "weekly"}</changefreq><priority>${
        u === SITE + "/" ? "1.0" : "0.7"
      }</priority></url>`
  )
  .join("\n")}
</urlset>
`;
  writeFileSync(join(distDir, "sitemap.xml"), sitemapXml, "utf-8");

  /* ---- rss.xml ---- */
  const rssItems = (articles || [])
    .slice(0, 20)
    .map((a) => {
      const url = `${SITE}/${a.slug}.html`;
      return `    <item>
      <title>${esc(a.headline)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <category>${esc(a.category || "News")}</category>
      <pubDate>${new Date(isoDate(a.published_at)).toUTCString()}</pubDate>
      <description>${esc(a.meta_description || a.standfirst || "")}</description>
    </item>`;
    })
    .join("\n");
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Nova Brief</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Marketing news that matters — campaigns, stories, stats and ideas from Nova Social.</description>
    <language>en-gb</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;
  writeFileSync(join(distDir, "rss.xml"), rss, "utf-8");

  console.log(
    `generate-articles: ${count} article page(s), ${SECTIONS.length} section page(s), ${brandMap.size} brand page(s), sitemap.xml, rss.xml.`
  );
}

main();
