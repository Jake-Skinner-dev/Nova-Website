// Nova Brief — site behaviour.
// Vanilla JS, no framework, to keep the production bundle tiny and let the
// whole publication deploy as static files (same rationale as the parent
// Nova Social site). This file drives: the masthead + mobile nav, scroll
// reveal, the newsletter signup, homepage hydration from Supabase (the
// hand-written seed markup is replaced when real rows exist), the search
// page, and the dev-mode section listings.

import { supabase } from "./supabaseClient.js";
import { slugify } from "./slugify.js";

const DEV = import.meta.env.DEV;
const body = document.body;
const page = body.dataset.page || "";

/* -------------------------------------------------- article URL helper */
// Production: each published article is a real file at /<slug>.html
// (extensionless too, via .htaccess). Dev: no generated pages exist, so
// preview through /article.html?slug=<slug>.
const articleUrl = (slug) =>
  DEV ? `/article.html?slug=${encodeURIComponent(slug)}` : `/${slug}.html`;

const sectionUrl = (s) => `/${s}.html`;

/* -------------------------------------------------- small DOM helpers */
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function link(href, className, text) {
  const a = el("a", className, text);
  a.href = href;
  return a;
}
function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function readTime(a) {
  if (a.reading_minutes) return `${a.reading_minutes} min read`;
  const words = String(a.body || "").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}
const catClass = (category) =>
  "kicker--" + slugify(category || "news").replace(/-.*$/, "");
const catChipClass = (category) =>
  "chip--" + slugify(category || "news").replace(/-.*$/, "");

/* ===================================================================
   Masthead + mobile nav
   =================================================================== */
const navToggle = document.getElementById("nav-toggle");
const mobileNav = document.getElementById("mobile-nav");
if (navToggle && mobileNav) {
  const close = () => {
    mobileNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open menu");
    document.body.style.overflow = "";
  };
  const open = () => {
    mobileNav.classList.add("is-open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Close menu");
    document.body.style.overflow = "hidden";
  };
  navToggle.addEventListener("click", () =>
    mobileNav.classList.contains("is-open") ? close() : open()
  );
  mobileNav.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
}

// Active section in the nav
const activeSection = body.dataset.section;
if (activeSection) {
  document
    .querySelectorAll(`.brief-nav a[data-section="${activeSection}"]`)
    .forEach((a) => a.classList.add("is-active"));
}

const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = String(new Date().getFullYear());

const masthead = document.getElementById("masthead");
if (masthead) {
  const onScrollHeader = () => masthead.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();
}

// Reading progress bar (article pages include #read-progress)
const progressBar = document.getElementById("read-progress");
if (progressBar) {
  const updateProgress = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    progressBar.style.width = max > 0 ? `${Math.min(100, (h.scrollTop / max) * 100)}%` : "0%";
  };
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();
}

/* ===================================================================
   Scroll reveal (ported from the parent site's main.js)
   =================================================================== */
const revealEls = Array.from(document.querySelectorAll("[data-reveal]"));
function armReveal() {
  const vh = window.innerHeight || 800;
  revealEls.forEach((elm) => {
    if (elm.classList.contains("is-in")) return;
    if (elm.getBoundingClientRect().top > vh * 0.92) elm.classList.add("is-armed");
  });
}
function checkReveal() {
  const vh = window.innerHeight || 800;
  revealEls.forEach((elm) => {
    if (elm.classList.contains("is-in")) return;
    const r = elm.getBoundingClientRect();
    if (r.top < vh * 0.92 && r.bottom > 0) {
      elm.classList.remove("is-armed");
      elm.classList.add("is-in");
    }
  });
}
armReveal();
requestAnimationFrame(() => {
  armReveal();
  checkReveal();
});
window.addEventListener("scroll", checkReveal, { passive: true });
window.addEventListener("resize", checkReveal);
setTimeout(() => {
  checkReveal();
  revealEls.forEach((elm) => elm.classList.add("is-in"));
}, 2500);

/* ===================================================================
   Newsletter signup — writes to brief_subscribers (anon INSERT only)
   =================================================================== */
document.querySelectorAll("#newsletter-form, [data-newsletter-form]").forEach((form) => {
  const emailInput = form.querySelector('input[type="email"]');
  const msg = form.querySelector(".form-msg") || form.querySelector("[data-form-msg]");
  const submit = form.querySelector('button[type="submit"]');
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (emailInput?.value || "").trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (msg) {
      msg.hidden = false;
      msg.style.color = "";
    }
    if (!valid) {
      if (msg) {
        msg.textContent = "Enter a valid email address.";
        msg.style.color = "#C0483E";
      }
      return;
    }
    if (submit) submit.disabled = true;
    const { error } = await supabase
      .from("brief_subscribers")
      .insert({ email, source: `web:${page || "site"}` });
    if (submit) submit.disabled = false;
    if (!msg) return;
    if (error && !/duplicate|unique/i.test(error.message)) {
      msg.textContent = "Something went wrong — try again shortly.";
      msg.style.color = "#C0483E";
    } else {
      msg.textContent = "You're on the list. Look out for the next Brief.";
      form.reset();
    }
  });
});

/* ===================================================================
   Shared query helpers
   =================================================================== */
async function fetchPublished(extra = (q) => q) {
  const base = supabase
    .from("brief_articles")
    .select(
      "slug, headline, standfirst, category, content_type, author, published_at, reading_minutes, featured_image_url, featured_image_alt, homepage_slot, sort_order, brand, nova_take, tags, is_sponsored, sponsor_name"
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });
  const { data, error } = await extra(base);
  if (error) {
    console.warn("[nova-brief] article query failed:", error.message);
    return [];
  }
  return data || [];
}

/* ===================================================================
   Homepage hydration
   =================================================================== */
async function hydrateHome() {
  const articles = await fetchPublished((q) => q.limit(60));
  if (articles.length) {
    const bySlot = (slot) => articles.filter((a) => a.homepage_slot === slot);

    renderTopStory(bySlot("top_story")[0] || articles[0]);
    renderQuickReads(pickQuickReads(articles));
    renderDailyBrief(articles);
    renderCampaignWeek(bySlot("campaign_of_week")[0]);
    renderStoryWeek(bySlot("story_of_week")[0]);
    renderNovaTake(articles.filter((a) => (a.content_type || "").toLowerCase().includes("take")));
    renderFocus(articles);
  }

  const { data: stats } = await supabase
    .from("brief_stats")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(3);
  if (stats && stats.length) renderKillerStats(stats);

  const { data: editions } = await supabase
    .from("brief_editions")
    .select("*")
    .eq("status", "published")
    .order("week_of", { ascending: false })
    .limit(1);
  if (editions && editions.length) renderWeeklyBrief(editions[0]);

  checkReveal();
}

function pickQuickReads(articles) {
  const flagged = articles.filter((a) => a.homepage_slot === "quick_read");
  const pool = flagged.length ? flagged : articles;
  return pool.slice(0, 5);
}

function replaceSeed(id, node) {
  const seed = document.getElementById(id);
  if (!seed || !node) return;
  node.id = id;
  seed.replaceWith(node);
}

function renderTopStory(a) {
  if (!a) return;
  const art = el("article", "top-story");
  art.appendChild(el("span", `kicker ${catClass(a.category)}`, a.category || "News"));
  const h = el("h2");
  h.appendChild(link(articleUrl(a.slug), null, a.headline));
  art.appendChild(h);
  if (a.standfirst) art.appendChild(el("p", "standfirst", a.standfirst));
  const media = link(articleUrl(a.slug), "top-story-media");
  media.setAttribute("data-tint", slugify(a.category || "news").replace(/-.*$/, ""));
  media.setAttribute("aria-hidden", "true");
  if (a.featured_image_url) {
    const img = el("img");
    img.src = a.featured_image_url;
    img.alt = a.featured_image_alt || "";
    img.loading = "eager";
    media.appendChild(img);
  }
  art.appendChild(media);
  const meta = el("div", "meta-line");
  meta.appendChild(el("span", null, fmtDate(a.published_at)));
  meta.appendChild(el("span", "dot"));
  meta.appendChild(el("span", null, readTime(a)));
  art.appendChild(meta);
  const more = link(articleUrl(a.slug), "arrow-link", "Read story ");
  more.appendChild(el("span", "arrow", "→"));
  art.appendChild(more);
  replaceSeed("top-story", art);
}

function renderQuickReads(items) {
  if (!items.length) return;
  const aside = el("aside", "quick-reads");
  aside.setAttribute("aria-label", "Quick reads");
  aside.appendChild(el("div", "qr-title", "Quick reads"));
  items.forEach((a, i) => {
    const row = el("div", "qr-item");
    row.appendChild(el("span", "qr-num", String(i + 1).padStart(2, "0")));
    const wrap = el("div");
    wrap.appendChild(el("span", "qr-cat", a.category || "News"));
    const h = el("h3");
    h.appendChild(link(articleUrl(a.slug), null, a.headline));
    wrap.appendChild(h);
    row.appendChild(wrap);
    aside.appendChild(row);
  });
  replaceSeed("quick-reads", aside);
}

function renderDailyBrief(articles) {
  const rows = articles.slice(0, 6);
  if (!rows.length) return;
  const list = el("div", "daily-brief-list");
  rows.forEach((a) => {
    const art = el("article", "brief-row" + (a.featured_image_url ? "" : " no-media"));
    const bodyDiv = el("div", "brief-row-body");
    bodyDiv.appendChild(el("span", `kicker ${catClass(a.category)}`, a.category || "News"));
    const h = el("h3");
    h.appendChild(link(articleUrl(a.slug), null, a.headline));
    bodyDiv.appendChild(h);
    if (a.standfirst) bodyDiv.appendChild(el("p", null, a.standfirst));
    const meta = el("div", "meta-line");
    meta.appendChild(el("span", null, fmtDate(a.published_at)));
    meta.appendChild(el("span", "dot"));
    meta.appendChild(el("span", null, readTime(a)));
    bodyDiv.appendChild(meta);
    art.appendChild(bodyDiv);
    if (a.featured_image_url) {
      const media = link(articleUrl(a.slug), "brief-row-media");
      const img = el("img");
      img.src = a.featured_image_url;
      img.alt = a.featured_image_alt || "";
      img.loading = "lazy";
      media.appendChild(img);
      art.appendChild(media);
    }
    list.appendChild(art);
  });
  replaceSeed("daily-brief", list);
}

function renderCampaignWeek(a) {
  if (!a) return;
  const wrap = el("div", "campaign-week");
  const media = link(articleUrl(a.slug), "cw-media");
  media.setAttribute("data-tint", "campaigns");
  media.setAttribute("aria-hidden", "true");
  if (a.featured_image_url) {
    const img = el("img");
    img.src = a.featured_image_url;
    img.alt = a.featured_image_alt || "";
    media.appendChild(img);
  }
  wrap.appendChild(media);
  const cwBody = el("div", "cw-body");
  if (a.brand) cwBody.appendChild(el("span", "cw-brand", a.brand));
  const h = el("h2");
  h.appendChild(link(articleUrl(a.slug), null, a.headline));
  cwBody.appendChild(h);
  if (a.standfirst) {
    const dl = el("dl", "cw-block");
    dl.appendChild(el("dt", null, "What happened"));
    dl.appendChild(el("dd", null, a.standfirst));
    cwBody.appendChild(dl);
  }
  if (a.nova_take) {
    const dl = el("dl", "cw-block cw-block--take");
    dl.appendChild(el("dt", null, "Our take"));
    dl.appendChild(el("dd", null, a.nova_take));
    cwBody.appendChild(dl);
  }
  const more = link(articleUrl(a.slug), "arrow-link", "Read the breakdown ");
  more.appendChild(el("span", "arrow", "→"));
  cwBody.appendChild(more);
  wrap.appendChild(cwBody);
  replaceSeed("campaign-week", wrap);
}

function renderStoryWeek(a) {
  if (!a) return;
  const wrap = el("div", "story-week");
  const media = link(articleUrl(a.slug), "sw-media");
  media.setAttribute("data-tint", slugify(a.category || "news").replace(/-.*$/, ""));
  media.setAttribute("aria-hidden", "true");
  if (a.featured_image_url) {
    const img = el("img");
    img.src = a.featured_image_url;
    img.alt = a.featured_image_alt || "";
    media.appendChild(img);
  }
  wrap.appendChild(media);
  const col = el("div");
  col.appendChild(el("span", `kicker ${catClass(a.category)}`, a.category || "News"));
  const h = el("h2");
  h.appendChild(link(articleUrl(a.slug), null, a.headline));
  col.appendChild(h);
  if (a.standfirst) col.appendChild(el("p", "standfirst", a.standfirst));
  const more = link(articleUrl(a.slug), "arrow-link", "Read the full story ");
  more.appendChild(el("span", "arrow", "→"));
  col.appendChild(more);
  wrap.appendChild(col);
  replaceSeed("story-week", wrap);
}

function renderNovaTake(items) {
  if (!items.length) return;
  const wrap = el("div", "nova-take");
  const label = el("div", "nt-label", "The Nova Take");
  wrap.appendChild(label);
  const listDiv = el("div", "nt-list");
  items.slice(0, 3).forEach((a) => {
    const it = el("div", "nt-item");
    const p = el("p");
    p.appendChild(link(articleUrl(a.slug), null, a.headline));
    it.appendChild(p);
    if (a.standfirst) it.appendChild(el("span", "nt-by", a.standfirst));
    listDiv.appendChild(it);
  });
  wrap.appendChild(listDiv);
  replaceSeed("nova-take", wrap);
}

function renderFocus(articles) {
  const seed = document.getElementById("focus-sections");
  if (!seed) return;
  const defs = [
    { label: "Focus on: AI", hue: "--c-ai", match: (a) => /\bai\b/i.test(a.category || "") },
    { label: "Focus on: Social", hue: "--c-social", match: (a) => /social/i.test(a.category || "") },
    { label: "Focus on: Brand", hue: "--c-branding", match: (a) => /brand/i.test(a.category || "") },
    {
      label: "Focus on: Advertising",
      hue: "--c-advertising",
      match: (a) => /advertis|campaign/i.test(a.category || "")
    }
  ];
  const blocks = defs
    .map((d) => ({ ...d, items: articles.filter(d.match).slice(0, 3) }))
    .filter((d) => d.items.length);
  if (!blocks.length) return;
  const grid = el("div", "focus-grid");
  blocks.forEach((d) => {
    const block = el("div", "focus-block");
    const head = el("div", "fb-head", d.label);
    head.style.setProperty("--fb-hue", `var(${d.hue})`);
    block.appendChild(head);
    const listDiv = el("div", "fb-list");
    d.items.forEach((a) => {
      const a2 = link(articleUrl(a.slug), null);
      a2.appendChild(el("span", "fb-hl", a.headline));
      a2.appendChild(el("span", "fb-meta", `${a.content_type || a.category || "News"} · ${readTime(a)}`));
      listDiv.appendChild(a2);
    });
    block.appendChild(listDiv);
    grid.appendChild(block);
  });
  replaceSeed("focus-sections", grid);
}

function renderKillerStats(stats) {
  const wrap = el("div", "killer-stats");
  stats.forEach((s) => {
    const fig = el("div", "stat-figure");
    fig.appendChild(el("span", "stat-num", s.value || ""));
    if (s.caption) fig.appendChild(el("span", "stat-cap", s.caption));
    if (s.source_url || s.source_name) {
      const src = el("span", "stat-src", "Source: ");
      if (s.source_url) {
        src.appendChild(link(s.source_url, null, s.source_name || "link"));
      } else {
        src.appendChild(document.createTextNode(s.source_name));
      }
      fig.appendChild(src);
    }
    if (s.sponsor_name) fig.appendChild(el("span", "stat-sponsor", `Sponsored by ${s.sponsor_name}`));
    wrap.appendChild(fig);
  });
  replaceSeed("killer-stats", wrap);
}

function renderWeeklyBrief(edition) {
  const wrap = el("div", "weekly-brief");
  const head = el("div", "wb-head");
  head.appendChild(el("h2", null, edition.title || "5 marketing stories you need to know this week"));
  if (edition.intro) head.appendChild(el("p", null, edition.intro));
  wrap.appendChild(head);
  const items = Array.isArray(edition.items) ? edition.items : [];
  items.slice(0, 5).forEach((it, i) => {
    const row = el("div", "wb-item");
    row.appendChild(el("span", "wb-num", String(i + 1).padStart(2, "0")));
    const col = el("div");
    const h = el("h3");
    if (it.link) h.appendChild(link(it.link, null, it.headline || ""));
    else h.textContent = it.headline || "";
    col.appendChild(h);
    if (it.summary) col.appendChild(el("p", null, it.summary));
    row.appendChild(col);
    if (it.category) row.appendChild(el("span", "wb-cat", it.category));
    wrap.appendChild(row);
  });
  replaceSeed("weekly-brief", wrap);
}

/* ===================================================================
   Section listing pages (dev shell — the generator ships static ones)
   =================================================================== */
async function hydrateSection() {
  const listEl = document.getElementById("section-list");
  if (!listEl || !activeSection) return;
  const nameMap = {
    news: "News", campaigns: "Campaigns", social: "Social", brand: "Branding",
    digital: "Digital", ai: "AI", advertising: "Advertising", agencies: "Agencies", stats: "Stats"
  };
  const wanted = nameMap[activeSection] || activeSection;
  const articles = await fetchPublished((q) => q.ilike("category", wanted).limit(40));
  listEl.replaceChildren();
  if (!articles.length) {
    listEl.appendChild(el("p", "meta-line", "No published stories in this section yet."));
    return;
  }
  articles.forEach((a) => listEl.appendChild(briefRow(a)));
  checkReveal();
}

function briefRow(a) {
  const art = el("article", "brief-row" + (a.featured_image_url ? "" : " no-media"));
  const bodyDiv = el("div", "brief-row-body");
  bodyDiv.appendChild(el("span", `kicker ${catClass(a.category)}`, a.category || "News"));
  const h = el("h3");
  h.appendChild(link(articleUrl(a.slug), null, a.headline));
  bodyDiv.appendChild(h);
  if (a.standfirst) bodyDiv.appendChild(el("p", null, a.standfirst));
  const meta = el("div", "meta-line");
  meta.appendChild(el("span", null, fmtDate(a.published_at)));
  meta.appendChild(el("span", "dot"));
  meta.appendChild(el("span", null, readTime(a)));
  bodyDiv.appendChild(meta);
  art.appendChild(bodyDiv);
  if (a.featured_image_url) {
    const media = link(articleUrl(a.slug), "brief-row-media");
    const img = el("img");
    img.src = a.featured_image_url;
    img.alt = a.featured_image_alt || "";
    img.loading = "lazy";
    media.appendChild(img);
    art.appendChild(media);
  }
  return art;
}

/* ===================================================================
   Search
   =================================================================== */
async function initSearch() {
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  const summary = document.getElementById("search-summary");
  if (!input || !results) return;

  const params = new URLSearchParams(location.search);
  const initial = params.get("q") || "";
  input.value = initial;

  const all = await fetchPublished((q) => q.limit(500));

  const run = (term) => {
    const t = term.trim().toLowerCase();
    results.replaceChildren();
    if (!t) {
      if (summary) summary.textContent = "Type to search stories, campaigns, brands, topics and authors.";
      return;
    }
    const hits = all.filter((a) =>
      [a.headline, a.standfirst, a.category, a.author, a.brand, (a.tags || []).join(" ")]
        .join(" • ")
        .toLowerCase()
        .includes(t)
    );
    if (summary) {
      summary.textContent = `${hits.length} result${hits.length === 1 ? "" : "s"} for "${term.trim()}"`;
    }
    hits.forEach((a) => results.appendChild(briefRow(a)));
    if (!hits.length) results.appendChild(el("p", "meta-line", "Nothing matched. Try a broader term."));
  };

  run(initial);
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const u = new URL(location.href);
      u.searchParams.set("q", input.value);
      history.replaceState(null, "", u);
      run(input.value);
    }, 180);
  });
}

/* ===================================================================
   Boot
   =================================================================== */
if (page === "home") hydrateHome().catch((e) => console.warn("[nova-brief]", e));
if (page === "section") hydrateSection().catch((e) => console.warn("[nova-brief]", e));
if (page === "search") initSearch().catch((e) => console.warn("[nova-brief]", e));
