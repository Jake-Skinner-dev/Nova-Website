// Nova Brief — dev-mode article preview.
// Renders one article by ?slug= so the editorial template can be checked
// with `npm run dev` before a full build. The production pages are static
// files written by scripts/generate-articles.mjs, which uses the exact
// same body-block conventions (see parseBody below and brief/README.md).

import { supabase } from "./supabaseClient.js";
import { slugify } from "./slugify.js";

/* -------- shared chrome (kept tiny; mirrors main.js) -------- */
const navToggle = document.getElementById("nav-toggle");
const mobileNav = document.getElementById("mobile-nav");
if (navToggle && mobileNav) {
  navToggle.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  });
  mobileNav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      mobileNav.classList.remove("is-open");
      document.body.style.overflow = "";
    })
  );
}
const fy = document.getElementById("footer-year");
if (fy) fy.textContent = String(new Date().getFullYear());

/* -------- reading progress -------- */
const bar = document.getElementById("read-progress");
if (bar) {
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = max > 0 ? `${(h.scrollTop / max) * 100}%` : "0%";
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* -------- helpers -------- */
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
function fmtDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v || "")
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
const kickerClass = (c) => "kicker--" + slugify(c || "news").replace(/-.*$/, "");

// Inline: **bold**  and  [label](https://url)
function inlineFrag(text) {
  const frag = document.createDocumentFragment();
  const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[2] != null) {
      frag.appendChild(el("strong", null, m[2]));
    } else {
      const a = el("a", null, m[4]);
      a.href = m[5];
      a.target = "_blank";
      a.rel = "noopener";
      frag.appendChild(a);
    }
    last = re.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

// Body → array of DOM nodes. Convention shared with the generator.
function parseBody(raw) {
  const out = [];
  const blocks = String(raw || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;

    if (block.startsWith("## ")) {
      out.push(el("h2", null, block.slice(3).trim()));
    } else if (block.startsWith("### ")) {
      out.push(el("h3", null, block.slice(4).trim()));
    } else if (block.startsWith("> ")) {
      const q = el("blockquote", "pullquote");
      q.appendChild(inlineFrag(block.replace(/^>\s?/gm, "").trim()));
      out.push(q);
    } else if (/^\[\[stat:/i.test(block)) {
      const inner = block.replace(/^\[\[stat:\s*/i, "").replace(/\]\]$/, "");
      const [value, caption, src] = inner.split("|").map((s) => (s || "").trim());
      const wrap = el("div", "inline-stat");
      wrap.appendChild(el("span", "is-num", value));
      if (caption) wrap.appendChild(el("span", "is-cap", caption));
      if (src) {
        const p = el("span", "is-cap");
        const a = el("a", null, "Source");
        a.href = src;
        a.target = "_blank";
        a.rel = "noopener";
        p.appendChild(a);
        wrap.appendChild(p);
      }
      out.push(wrap);
    } else if (block.split("\n").every((l) => /^[-*]\s+/.test(l))) {
      const ul = el("ul");
      block.split("\n").forEach((l) => {
        const li = el("li");
        li.appendChild(inlineFrag(l.replace(/^[-*]\s+/, "")));
        ul.appendChild(li);
      });
      out.push(ul);
    } else {
      const p = el("p");
      p.appendChild(inlineFrag(block));
      out.push(p);
    }
  }
  return out;
}

/* -------- render -------- */
async function render() {
  const root = document.getElementById("article-root");
  const relatedWrap = document.getElementById("article-related");
  const slug = new URLSearchParams(location.search).get("slug");
  if (!slug) {
    root.replaceChildren(el("p", "meta-line", "No ?slug= given."));
    return;
  }

  const { data: a, error } = await supabase
    .from("brief_articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !a) {
    root.replaceChildren(
      el("p", "meta-line", "That story isn't published, or the slug is wrong.")
    );
    return;
  }

  document.title = `${a.seo_title || a.headline} | Nova Brief`;

  root.replaceChildren();

  const head = el("div", "article-head");
  head.appendChild(el("span", `kicker ${kickerClass(a.category)}`, a.category || "News"));
  head.appendChild(el("h1", null, a.headline));
  if (a.standfirst) head.appendChild(el("p", "standfirst", a.standfirst));
  root.appendChild(head);

  const byline = el("div", "article-byline");
  byline.appendChild(document.createTextNode("By "));
  byline.appendChild(el("strong", null, a.author || "Nova Brief"));
  byline.appendChild(el("span", "dot"));
  byline.appendChild(el("span", null, fmtDate(a.published_at)));
  byline.appendChild(el("span", "dot"));
  byline.appendChild(el("span", null, `${a.reading_minutes || 3} min read`));
  if (a.is_sponsored) {
    byline.appendChild(el("span", "dot"));
    byline.appendChild(el("span", null, `Sponsored${a.sponsor_name ? ` · ${a.sponsor_name}` : ""}`));
  }
  root.appendChild(byline);

  if (a.featured_image_url) {
    const fig = el("figure", "article-hero");
    const img = el("img");
    img.src = a.featured_image_url;
    img.alt = a.featured_image_alt || "";
    fig.appendChild(img);
    root.appendChild(fig);
  }

  const bodyEl = el("div", "article-body");
  parseBody(a.body).forEach((n) => bodyEl.appendChild(n));
  root.appendChild(bodyEl);

  if (a.nova_take) {
    const box = el("aside", "article-aside nova-take-box");
    box.appendChild(el("div", "aside-label nt-label", "The Nova Take"));
    box.appendChild(el("p", null, a.nova_take));
    root.appendChild(box);
  }

  if (a.source_name || a.source_url) {
    const src = el("p", "article-source", "Source: ");
    if (a.source_url) {
      const link = el("a", null, a.source_name || a.source_url);
      link.href = a.source_url;
      link.target = "_blank";
      link.rel = "noopener";
      src.appendChild(link);
    } else {
      src.appendChild(document.createTextNode(a.source_name));
    }
    root.appendChild(src);
  }

  if (Array.isArray(a.tags) && a.tags.length) {
    const tagRow = el("div", "article-tags");
    a.tags.forEach((t) => {
      const c = el("a", "chip", t);
      c.href = `/search.html?q=${encodeURIComponent(t)}`;
      tagRow.appendChild(c);
    });
    root.appendChild(tagRow);
  }

  // Related — same category
  const { data: rel } = await supabase
    .from("brief_articles")
    .select("slug, headline, category")
    .eq("status", "published")
    .eq("category", a.category)
    .neq("slug", a.slug)
    .order("published_at", { ascending: false })
    .limit(3);
  if (rel && rel.length && relatedWrap) {
    relatedWrap.appendChild(el("p", "section-label", "Related"));
    const grid = el("div", "related");
    rel.forEach((r) => {
      const card = el("div", "related-card");
      const h = el("h3");
      const link = el("a", null, r.headline);
      link.href = `/article.html?slug=${encodeURIComponent(r.slug)}`;
      h.appendChild(link);
      card.appendChild(el("span", `kicker ${kickerClass(r.category)}`, r.category || "News"));
      card.appendChild(h);
      grid.appendChild(card);
    });
    relatedWrap.appendChild(grid);
  }
}

render().catch((e) => console.warn("[nova-brief] article render failed:", e));
