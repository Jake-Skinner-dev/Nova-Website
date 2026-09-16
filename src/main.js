// Nova Social — site behaviour (scroll reveal, nav, modals, contact form).
// No framework: the design is presentational, so vanilla JS keeps the
// production bundle tiny and avoids a persistent Node server on cPanel.

import { supabase } from "./supabaseClient.js";
import { slugify } from "./slugify.js";

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
  document.body.classList.remove("nav-open");
  mobileNav.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open menu");
  mobileNav.querySelectorAll(".mobile-nav-submenu.is-open").forEach((submenu) => {
    submenu.classList.remove("is-open");
    const toggle = mobileNav.querySelector(`[aria-controls="${submenu.id}"]`);
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
}
function openMobileNav() {
  document.body.classList.add("nav-open");
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

// Services submenu accordion (mobile) — tap the caret to expand/collapse
// without navigating away, tap a submenu link to navigate + close the nav.
mobileNav.querySelectorAll("[data-mobile-submenu-toggle]").forEach((toggle) => {
  const submenu = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!submenu) return;
  toggle.addEventListener("click", () => {
    const isOpen = submenu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
});

/* ---------------------------------------------------------------------
   Scroll reveal
   --------------------------------------------------------------------- */
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
function checkReveal() {} // Kept for content refresh callers; IntersectionObserver owns reveals.
if ('IntersectionObserver' in window && !motionPreference.matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(({target, isIntersecting}) => {
      if (!isIntersecting) return;
      target.classList.remove('is-armed'); target.classList.add('is-in'); observer.unobserve(target);
    });
  }, {threshold: 0.08});
  revealEls.forEach(element => {
    if (element.getBoundingClientRect().top > window.innerHeight) element.classList.add('is-armed');
    observer.observe(element);
  });
}
// Pausing is persistent for this tab, and the OS preference remains authoritative.
const motionToggle = document.getElementById('motion-toggle');
let motionPaused = false;
try { motionPaused = sessionStorage.getItem('nova-motion-paused') === 'true'; } catch {}
function applyMotion() {
  const paused = motionPaused || motionPreference.matches;
  document.documentElement.classList.toggle('motion-paused', paused);
  if (motionToggle) {
    motionToggle.setAttribute('aria-pressed', String(paused));
    motionToggle.textContent = motionPreference.matches ? 'Reduced motion on' : paused ? 'Resume motion ▷' : 'Pause motion Ⅱ';
    motionToggle.disabled = motionPreference.matches;
  }
}
motionToggle?.addEventListener('click', () => {
  motionPaused = !motionPaused;
  try { sessionStorage.setItem('nova-motion-paused', String(motionPaused)); } catch {}
  applyMotion();
});
motionPreference.addEventListener('change', applyMotion);
applyMotion();

// Manual navigation and keyboard activation share the same tab state.
const serviceTabs = [...document.querySelectorAll('.service-choice[role="tab"]')];
function selectService(tab) {
  serviceTabs.forEach(item => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  });
}
serviceTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectService(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % serviceTabs.length;
    if (event.key === 'ArrowUp') next = (index - 1 + serviceTabs.length) % serviceTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = serviceTabs.length - 1;
    if (next === undefined) return;
    event.preventDefault(); selectService(serviceTabs[next]); serviceTabs[next].focus();
  });
});

/* ---------------------------------------------------------------------
   Modal helpers
   --------------------------------------------------------------------- */
const openBackdrops = [];
const modalTriggers = new WeakMap();

function openModal(backdrop) {
  if (!backdrop || openBackdrops.includes(backdrop)) return;
  modalTriggers.set(backdrop, document.activeElement);
  closeMobileNav();
  backdrop.classList.add("is-open");
  openBackdrops.push(backdrop);
  document.body.style.overflow = "hidden";
  const closeBtn = backdrop.querySelector(".modal-close");
  if (closeBtn) closeBtn.focus();
}
function closeModal(backdrop) {
  if (!backdrop || !backdrop.classList.contains("is-open")) return;
  backdrop.classList.remove("is-open");
  const idx = openBackdrops.indexOf(backdrop);
  if (idx !== -1) openBackdrops.splice(idx, 1);
  if (openBackdrops.length === 0) document.body.style.overflow = "";
  modalTriggers.get(backdrop)?.focus();
}
function closeTopModal() {
  const top = openBackdrops[openBackdrops.length - 1];
  if (top) closeModal(top);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (openBackdrops.length) closeTopModal();
    else if (mobileNav.classList.contains('is-open')) { closeMobileNav(); navToggle.focus(); }
  }
  const scope = openBackdrops.at(-1) || (mobileNav.classList.contains('is-open') ? mobileNav : null);
  if (e.key !== 'Tab' || !scope) return;
  const controls = [...scope.querySelectorAll('a[href],button,input,select,textarea,iframe,[tabindex="0"]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  if (scope === mobileNav) controls.unshift(navToggle);
  const first = controls[0], last = controls.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
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
  if (discoveryBackdrop) closeModal(discoveryBackdrop);
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
    openContact(el.dataset.need);
  });
});

/* ---------------------------------------------------------------------
   Discovery call modal (Google Calendar appointment booking)
   --------------------------------------------------------------------- */
const discoveryBackdrop = document.getElementById("discovery-backdrop");
const discoveryFrame = document.getElementById("discovery-calendar-frame");

function openDiscovery() {
  if (contactBackdrop) closeModal(contactBackdrop);
  // Only point the iframe at Google the first time it's opened, so a visitor
  // who never clicks this never triggers a request to Google at all.
  if (discoveryFrame && !discoveryFrame.src && discoveryFrame.dataset.src) {
    discoveryFrame.src = discoveryFrame.dataset.src;
  }
  openModal(discoveryBackdrop);
}

document.querySelectorAll("[data-open-discovery]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openDiscovery();
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
      const response = await res.json();
      const ok = res.ok && response.success === true;
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
  const link = el("a", "read-more", "Read Article →");
  // Each article gets its own static page at build time (see
  // scripts/generate-insight-pages.mjs) using this exact same slug. A
  // brand-new article won't have its page live until the next deploy.
  link.href = `/insights/${slugify(article.title)}.html`;
  card.appendChild(link);
  return card;
}

async function loadContent() {
  // Each page only has the grid(s) it needs — skip the query entirely when
  // there's nowhere on this page to render the result.
  if (!workGrid && !insightsGrid) return;

  const [campaignsRes, articlesRes] = await Promise.all([
    workGrid
      ? supabase.from("campaigns").select("*").order("sort_order", { ascending: true })
      : Promise.resolve(null),
    insightsGrid
      ? supabase.from("articles").select("*").order("sort_order", { ascending: true })
      : Promise.resolve(null)
  ]);

  if (workGrid) {
    workGrid.innerHTML = "";
    if (campaignsRes.error || !campaignsRes.data?.length) {
      workGrid.appendChild(el("p", "content-status", campaignsRes.error ? "More project details are temporarily unavailable. You can still explore our featured Ratby project above." : "Explore our featured Ratby project above, or get in touch to discuss your brand."));
    } else {
      campaignsRes.data.forEach((c) => workGrid.appendChild(renderWorkCard(c)));
    }
  }

  if (insightsGrid) {
    insightsGrid.innerHTML = "";
    if (articlesRes.error || !articlesRes.data?.length) {
      insightsGrid.appendChild(el("p", "content-status", "Our insights are temporarily unavailable. Please try again shortly, or visit Nova Social on LinkedIn for our latest thinking."));
    } else {
      articlesRes.data.forEach((a) => insightsGrid.appendChild(renderInsightCard(a)));
    }
  }

  // Newly-inserted cards start below the fold visually but have no
  // [data-reveal] wrapper of their own here — re-run the reveal check so
  // anything already in view is shown rather than waiting on a scroll event.
  checkReveal();
}
loadContent().catch(() => {
  [workGrid, insightsGrid].filter(Boolean).forEach(grid => {
    grid.replaceChildren(el("p", "content-status", "This content is temporarily unavailable. Please try again shortly."));
  });
});

/* ---------------------------------------------------------------------
   Misc
   --------------------------------------------------------------------- */
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = String(new Date().getFullYear());

// Highlight the current page's nav link (each page is its own URL now, so
// this is a static match rather than a scroll-position calculation).
const currentPage = document.body.dataset.page || "home";
document.querySelectorAll(".nav-links a[data-page], .mobile-nav a[data-page]").forEach((a) => {
  const active = a.dataset.page === currentPage;
  a.classList.toggle("is-active", active);
  if (active) a.setAttribute("aria-current", "page");
});
