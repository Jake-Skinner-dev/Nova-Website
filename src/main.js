// Nova Social — site behaviour (scroll reveal, nav, modals, contact form).
// No framework: the design is presentational, so vanilla JS keeps the
// production bundle tiny and avoids a persistent Node server on cPanel.

import { supabase } from "./supabaseClient.js";

const header = document.getElementById("site-header");
const navToggle = document.getElementById("nav-toggle");
const mobileNav = document.getElementById("mobile-nav");

/* ---------------------------------------------------------------------
   Header shrink + mobile nav
   --------------------------------------------------------------------- */
function onScroll() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 40);
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

function closeMobileNav() {
  mobileNav.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open menu");
}
function openMobileNav() {
  mobileNav.classList.add("is-open");
  navToggle.setAttribute("aria-expanded", "true");
  navToggle.setAttribute("aria-label", "Close menu");
}
if (navToggle) {
  navToggle.addEventListener("click", () => {
    mobileNav.classList.contains("is-open") ? closeMobileNav() : openMobileNav();
  });
}
mobileNav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMobileNav));

/* ---------------------------------------------------------------------
   Scroll reveal
   --------------------------------------------------------------------- */
const revealEls = Array.from(document.querySelectorAll("[data-reveal]"));

function armReveal() {
  const vh = window.innerHeight || 800;
  revealEls.forEach((el) => {
    if (el.classList.contains("is-in")) return;
    const r = el.getBoundingClientRect();
    if (r.top > vh * 0.94) el.classList.add("is-armed");
  });
}
function checkReveal() {
  const vh = window.innerHeight || 800;
  revealEls.forEach((el) => {
    if (el.classList.contains("is-in")) return;
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.94 && r.bottom > 0) {
      el.classList.remove("is-armed");
      el.classList.add("is-in");
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
// Safety net: if reveal never triggers (e.g. very short pages), show everything.
setTimeout(() => {
  checkReveal();
  revealEls.forEach((el) => el.classList.add("is-in"));
}, 2000);

/* ---------------------------------------------------------------------
   Modal helpers
   --------------------------------------------------------------------- */
const openBackdrops = [];

function openModal(backdrop) {
  backdrop.classList.add("is-open");
  openBackdrops.push(backdrop);
  document.body.style.overflow = "hidden";
  const closeBtn = backdrop.querySelector(".modal-close");
  if (closeBtn) closeBtn.focus();
}
function closeModal(backdrop) {
  backdrop.classList.remove("is-open");
  const idx = openBackdrops.indexOf(backdrop);
  if (idx !== -1) openBackdrops.splice(idx, 1);
  if (openBackdrops.length === 0) document.body.style.overflow = "";
}
function closeTopModal() {
  const top = openBackdrops[openBackdrops.length - 1];
  if (top) closeModal(top);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTopModal();
});

document.querySelectorAll(".modal-backdrop[data-close-on-backdrop]").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal(backdrop);
  });
});
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const backdrop = btn.closest(".modal-backdrop");
    if (backdrop) closeModal(backdrop);
  });
});

/* ---------------------------------------------------------------------
   Contact modal
   --------------------------------------------------------------------- */
const contactBackdrop = document.getElementById("contact-backdrop");
const contactForm = document.getElementById("contact-form");
const contactFormPanel = document.getElementById("contact-form-panel");
const contactSuccess = document.getElementById("contact-success");
const contactError = document.getElementById("cf-error");
const contactSubmit = document.getElementById("cf-submit");
const articleBackdrop = document.getElementById("article-backdrop");

function openContact(prefillNeed) {
  if (articleBackdrop) closeModal(articleBackdrop);
  contactFormPanel.hidden = false;
  contactSuccess.hidden = true;
  contactError.hidden = true;
  if (prefillNeed) {
    const select = document.getElementById("cf-need");
    const match = Array.from(select.options).find((o) => o.value === prefillNeed);
    if (match) select.value = prefillNeed;
  }
  openModal(contactBackdrop);
}

document.querySelectorAll("[data-open-contact]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openContact();
  });
});

if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("cf-name").value.trim();
    const email = document.getElementById("cf-email").value.trim();
    const honeypot = document.getElementById("cf-website").value;

    if (!name || !email) {
      contactError.hidden = false;
      return;
    }
    if (honeypot) {
      // Silently "succeed" for bots without sending anything.
      contactFormPanel.hidden = true;
      contactSuccess.hidden = false;
      return;
    }

    contactError.hidden = true;
    contactSubmit.disabled = true;
    contactSubmit.textContent = "Sending…";

    const payload = new FormData(contactForm);

    try {
      const res = await fetch("/contact.php", {
        method: "POST",
        body: payload,
        headers: { Accept: "application/json" }
      });
      const ok = res.ok && (await res.json().catch(() => ({ success: true }))).success !== false;
      if (!ok) throw new Error("Send failed");
      contactFormPanel.hidden = true;
      contactSuccess.hidden = false;
      contactForm.reset();
    } catch (err) {
      contactError.textContent = "Something went wrong sending your message. Please try again, or email us directly.";
      contactError.hidden = false;
    } finally {
      contactSubmit.disabled = false;
      contactSubmit.textContent = "Send Message";
    }
  });
}

/* ---------------------------------------------------------------------
   Dynamic content — Our Work + Insights, loaded from Supabase so the
   admin panel's edits show up here without a code deploy. Rendered with
   textContent (never innerHTML) since this content comes from a content
   editor, not a developer — treat it as untrusted input.
   --------------------------------------------------------------------- */
const workGrid = document.getElementById("work-grid");
const insightsGrid = document.getElementById("insights-grid");
let articlesData = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderWorkCard(campaign) {
  const article = el("article", "work-card");

  const thumb = el("div", "thumb");
  if (campaign.image_url) {
    const img = el("img");
    img.src = campaign.image_url;
    img.alt = campaign.name ? `${campaign.name} campaign` : "Campaign image";
    img.loading = "lazy";
    img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
    thumb.style.padding = "0";
    thumb.appendChild(img);
    const overlay = el("div");
    overlay.style.cssText =
      "position:absolute;inset:0;background:linear-gradient(180deg, rgba(7,8,14,0) 45%, rgba(7,8,14,0.72));";
    thumb.style.position = "relative";
    thumb.appendChild(overlay);
  } else {
    thumb.appendChild(el("span", null, campaign.image_label || "CAMPAIGN IMAGE"));
  }
  article.appendChild(thumb);

  const body = el("div", "body");
  const titleRow = el("div", "title-row");
  titleRow.appendChild(el("h3", null, campaign.name));
  titleRow.appendChild(el("span", "industry", campaign.industry));
  body.appendChild(titleRow);

  body.appendChild(el("p", "label", "CHALLENGE"));
  body.appendChild(el("p", "challenge", campaign.challenge));
  body.appendChild(el("p", "label", "SERVICES"));
  body.appendChild(el("p", "services", campaign.services));

  const metrics = el("div", "work-metrics");
  [
    [campaign.m1_label, campaign.m1_value],
    [campaign.m2_label, campaign.m2_value]
  ].forEach(([label, value]) => {
    const metric = el("div", "metric");
    metric.appendChild(el("div", "m-label", label));
    metric.appendChild(el("div", "m-value", value));
    metrics.appendChild(metric);
  });
  body.appendChild(metrics);
  article.appendChild(body);
  return article;
}

function renderInsightCard(article) {
  const card = el("article", "insight-card");
  const meta = el("div", "meta-row");
  meta.appendChild(el("span", "category", article.category));
  meta.appendChild(el("span", "date", article.date_label));
  card.appendChild(meta);
  card.appendChild(el("h3", null, article.title));
  card.appendChild(el("p", null, article.description));
  const btn = el("button", "read-more", "Read Article →");
  btn.type = "button";
  btn.setAttribute("data-open-article", article.id);
  btn.addEventListener("click", () => openArticle(article.id));
  card.appendChild(btn);
  return card;
}

async function loadContent() {
  const [campaignsRes, articlesRes] = await Promise.all([
    supabase.from("campaigns").select("*").order("sort_order", { ascending: true }),
    supabase.from("articles").select("*").order("sort_order", { ascending: true })
  ]);

  if (workGrid) {
    workGrid.innerHTML = "";
    if (campaignsRes.error || !campaignsRes.data?.length) {
      workGrid.replaceChildren();
    } else {
      campaignsRes.data.forEach((c) => workGrid.appendChild(renderWorkCard(c)));
    }
  }

  if (insightsGrid) {
    insightsGrid.innerHTML = "";
    if (!articlesRes.error && articlesRes.data) {
      articlesData = articlesRes.data;
      articlesData.forEach((a) => insightsGrid.appendChild(renderInsightCard(a)));
    }
  }

  // Newly-inserted cards start below the fold visually but have no
  // [data-reveal] wrapper of their own here — re-run the reveal check so
  // anything already in view is shown rather than waiting on a scroll event.
  checkReveal();
}
loadContent();

function openArticle(id) {
  const article = articlesData.find((a) => a.id === id);
  if (!article) return;
  document.getElementById("article-category").textContent = article.category;
  document.getElementById("article-date").textContent = article.date_label;
  document.getElementById("article-modal-title").textContent = article.title;
  document.getElementById("article-dek").textContent = article.description;
  const body = document.getElementById("article-body");
  body.innerHTML = "";
  String(article.body || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      const p_el = document.createElement("p");
      p_el.textContent = p;
      body.appendChild(p_el);
    });
  openModal(articleBackdrop);
}

/* ---------------------------------------------------------------------
   Misc
   --------------------------------------------------------------------- */
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = String(new Date().getFullYear());

// Highlight the active section link on scroll (progressive enhancement).
const sectionIds = ["top", "services", "work", "insights", "about", "contact"];
const navLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
function updateActiveLink() {
  let current = sectionIds[0];
  for (const id of sectionIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.4) current = id;
  }
  navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${current}`));
}
window.addEventListener("scroll", updateActiveLink, { passive: true });
updateActiveLink();
