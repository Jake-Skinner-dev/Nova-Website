// Nova Social — site behaviour (scroll reveal, nav, modals, contact form).
// No framework: the design is presentational, so vanilla JS keeps the
// production bundle tiny and avoids a persistent Node server on cPanel.

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
   Article modal
   --------------------------------------------------------------------- */
const articlesData = JSON.parse(document.getElementById("articles-data").textContent);

function openArticle(id) {
  const article = articlesData.find((a) => a.id === id);
  if (!article) return;
  document.getElementById("article-category").textContent = article.category;
  document.getElementById("article-date").textContent = article.date;
  document.getElementById("article-modal-title").textContent = article.title;
  document.getElementById("article-dek").textContent = article.description;
  const body = document.getElementById("article-body");
  body.innerHTML = "";
  article.paragraphs.forEach((p) => {
    const el = document.createElement("p");
    el.textContent = p;
    body.appendChild(el);
  });
  openModal(articleBackdrop);
}

document.querySelectorAll("[data-open-article]").forEach((btn) => {
  btn.addEventListener("click", () => openArticle(btn.getAttribute("data-open-article")));
});

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
