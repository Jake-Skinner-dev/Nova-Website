// Nova Social — admin panel. Standalone page (not part of the main site's
// Vite bundle) so the public bundle stays small; loads supabase-js from a
// CDN since this page is served as-is with no build step.

const SUPABASE_URL = "https://whtsdbhnnwxgqfubkmxp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodHNkYmhubnd4Z3FmdWJrbXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzcwMDUsImV4cCI6MjEwMjgxMzAwNX0.LnH5rJzxiaxjQjrC3PcnkQ-UA0KP0feGYdI0WqiOeXY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const views = {
  loading: document.getElementById("view-loading"),
  login: document.getElementById("view-login"),
  forgot: document.getElementById("view-forgot"),
  reset: document.getElementById("view-reset"),
  dashboard: document.getElementById("view-dashboard")
};
function showView(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
}

// A password-reset email link lands back here with `type=recovery` in the
// URL. Supabase's client parses that into a temporary session and fires a
// PASSWORD_RECOVERY auth event -- but getSession() below would also see
// that temporary session and (without this flag) route straight to the
// dashboard instead of the "set a new password" screen.
const isPasswordRecovery =
  window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).get("type") === "recovery";

/* ---------------------------------------------------------------------
   Auth
   --------------------------------------------------------------------- */
async function checkSession() {
  if (isPasswordRecovery) {
    showView("reset");
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) {
    showView("dashboard");
    loadAll();
  } else {
    showView("login");
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  const { error } = await sb.auth.signInWithPassword({ email, password });

  submitBtn.disabled = false;
  submitBtn.textContent = "Sign in";

  if (error) {
    errorEl.textContent = "Incorrect email or password.";
    errorEl.hidden = false;
    return;
  }
  showView("dashboard");
  loadAll();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  showView("login");
});

/* ---------------------------------------------------------------------
   Forgot / reset password
   --------------------------------------------------------------------- */
document.getElementById("show-forgot").addEventListener("click", () => {
  document.getElementById("forgot-error").hidden = true;
  document.getElementById("forgot-success").hidden = true;
  showView("forgot");
});
document.getElementById("show-login").addEventListener("click", () => showView("login"));

document.getElementById("forgot-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("forgot-email").value.trim();
  const errorEl = document.getElementById("forgot-error");
  const successEl = document.getElementById("forgot-success");
  const submitBtn = document.getElementById("forgot-submit");
  errorEl.hidden = true;
  successEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    // Hardcoded rather than window.location.origin -- otherwise a reset
    // requested from the local dev server or a Vercel preview bakes that
    // URL into the emailed link instead of the real production admin page.
    redirectTo: "https://www.novasocial.co.uk/admin/"
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Send reset link";

  if (error) {
    errorEl.textContent = "Could not send reset link: " + error.message;
    errorEl.hidden = false;
    return;
  }
  // Don't reveal whether the email is a real admin account either way --
  // Supabase itself returns success regardless, so this message is accurate.
  successEl.hidden = false;
  document.getElementById("forgot-form").reset();
});

document.getElementById("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("reset-password").value;
  const confirm = document.getElementById("reset-password-confirm").value;
  const errorEl = document.getElementById("reset-error");
  const submitBtn = document.getElementById("reset-submit");
  errorEl.hidden = true;

  if (password !== confirm) {
    errorEl.textContent = "Passwords don't match.";
    errorEl.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Updating…";

  const { error } = await sb.auth.updateUser({ password });

  submitBtn.disabled = false;
  submitBtn.textContent = "Update password";

  if (error) {
    errorEl.textContent = "Could not update password: " + error.message;
    errorEl.hidden = false;
    return;
  }

  // Clear the recovery params from the URL so a refresh doesn't re-trigger
  // the reset screen, then go straight into the now-updated account.
  window.history.replaceState({}, "", window.location.pathname);
  showView("dashboard");
  loadAll();
});

/* ---------------------------------------------------------------------
   Tabs
   --------------------------------------------------------------------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const tab = btn.getAttribute("data-tab");
    document.getElementById("tab-campaigns").hidden = tab !== "campaigns";
    document.getElementById("tab-articles").hidden = tab !== "articles";
  });
});

/* ---------------------------------------------------------------------
   Shared helpers
   --------------------------------------------------------------------- */
// Kept in sync by hand with src/slugify.js — this page is deliberately
// unbundled (see file header), so it can't import that module directly.
function slugify(text) {
  return (
    String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article"
  );
}
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
}
function field(labelText, inputEl) {
  return el("div", { class: "field" }, [el("label", { text: labelText }), inputEl]);
}
function input(value, opts = {}) {
  const i = el("input", { type: opts.type || "text" });
  i.value = value ?? "";
  if (opts.placeholder) i.placeholder = opts.placeholder;
  return i;
}
function textarea(value, rows = 4) {
  const t = el("textarea", { rows: String(rows) });
  t.value = value ?? "";
  return t;
}

/* ---------------------------------------------------------------------
   Campaigns
   --------------------------------------------------------------------- */
async function loadAll() {
  await Promise.all([loadCampaigns(), loadArticles()]);
}

async function loadCampaigns() {
  const list = document.getElementById("campaign-list");
  list.innerHTML = "";
  const { data, error } = await sb.from("campaigns").select("*").order("sort_order", { ascending: true });
  if (error) {
    list.appendChild(el("p", { class: "error-msg", text: "Could not load campaigns: " + error.message }));
    return;
  }
  document.getElementById("campaign-count").textContent = String(data.length);
  data.forEach((c) => list.appendChild(renderCampaignCard(c)));
}

function renderCampaignCard(campaign) {
  const card = el("div", { class: "item-card" });
  const status = el("p", { class: "status-msg" });
  status.hidden = true;
  const errorMsg = el("p", { class: "error-msg" });
  errorMsg.hidden = true;

  const nameInput = input(campaign.name, { placeholder: "Harbour Coffee Co." });
  const industryInput = input(campaign.industry, { placeholder: "HOSPITALITY" });
  const challengeInput = input(campaign.challenge, { placeholder: "What they were struggling with" });
  const servicesInput = input(campaign.services, { placeholder: "Brand strategy, content planning" });
  const m1LabelInput = input(campaign.m1_label, { placeholder: "REACH" });
  const m1ValueInput = input(campaign.m1_value, { placeholder: "+35%" });
  const m2LabelInput = input(campaign.m2_label, { placeholder: "CONSISTENCY" });
  const m2ValueInput = input(campaign.m2_value, { placeholder: "Improved" });
  const imageLabelInput = input(campaign.image_label, { placeholder: "CAMPAIGN IMAGE" });
  const sortInput = input(String(campaign.sort_order ?? 0), { type: "number" });

  // Thumbnail + upload
  const thumbRow = el("div", { class: "thumb-row" });
  function renderThumb(url) {
    thumbRow.innerHTML = "";
    if (url) {
      const img = el("img");
      img.src = url;
      thumbRow.appendChild(img);
    } else {
      thumbRow.appendChild(el("div", { class: "no-image", text: "NO IMAGE" }));
    }
    const fileLabel = el("label", { class: "file-label", text: "Upload image" });
    const fileInput = el("input", { type: "file", accept: "image/*" });
    fileLabel.appendChild(fileInput);
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      status.hidden = true;
      errorMsg.hidden = true;
      const path = `${campaign.id}-${Date.now()}.${(file.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
      const { error: upErr } = await sb.storage.from("campaign-images").upload(path, file, { upsert: true });
      if (upErr) {
        errorMsg.textContent = "Upload failed: " + upErr.message;
        errorMsg.hidden = false;
        return;
      }
      const { data: pub } = sb.storage.from("campaign-images").getPublicUrl(path);
      campaign.image_url = pub.publicUrl;
      renderThumb(pub.publicUrl);
    });
    thumbRow.appendChild(fileLabel);
    if (url) {
      const removeBtn = el("button", { type: "button", class: "btn btn-ghost", text: "Remove" });
      removeBtn.addEventListener("click", () => {
        campaign.image_url = null;
        renderThumb(null);
      });
      thumbRow.appendChild(removeBtn);
    }
  }
  renderThumb(campaign.image_url);

  const grid = el("div", { class: "row-2" });
  grid.appendChild(field("Client", nameInput));
  grid.appendChild(field("Industry", industryInput));
  const challengeField = field("Challenge", challengeInput);
  challengeField.classList.add("span-2");
  grid.appendChild(challengeField);
  const servicesField = field("Services", servicesInput);
  servicesField.classList.add("span-2");
  grid.appendChild(servicesField);
  const imageLabelField = field("Image caption (shown if no image)", imageLabelInput);
  imageLabelField.classList.add("span-2");
  grid.appendChild(imageLabelField);
  grid.appendChild(field("Result 1 label", m1LabelInput));
  grid.appendChild(field("Result 1 value", m1ValueInput));
  grid.appendChild(field("Result 2 label", m2LabelInput));
  grid.appendChild(field("Result 2 value", m2ValueInput));
  grid.appendChild(field("Order (lower shows first)", sortInput));

  const actions = el("div", { style: "display:flex;gap:10px;margin-top:16px;" });
  const saveBtn = el("button", { type: "button", class: "btn btn-primary", text: "Save" });
  const deleteBtn = el("button", { type: "button", class: "btn btn-danger", text: "Delete" });
  actions.appendChild(saveBtn);
  actions.appendChild(deleteBtn);

  saveBtn.addEventListener("click", async () => {
    status.hidden = true;
    errorMsg.hidden = true;
    saveBtn.disabled = true;
    const update = {
      name: nameInput.value.trim(),
      industry: industryInput.value.trim(),
      challenge: challengeInput.value.trim(),
      services: servicesInput.value.trim(),
      m1_label: m1LabelInput.value.trim(),
      m1_value: m1ValueInput.value.trim(),
      m2_label: m2LabelInput.value.trim(),
      m2_value: m2ValueInput.value.trim(),
      image_label: imageLabelInput.value.trim(),
      image_url: campaign.image_url || null,
      sort_order: Number(sortInput.value) || 0
    };
    const { error } = await sb.from("campaigns").update(update).eq("id", campaign.id);
    saveBtn.disabled = false;
    if (error) {
      errorMsg.textContent = "Save failed: " + error.message;
      errorMsg.hidden = false;
    } else {
      status.textContent = "Saved.";
      status.hidden = false;
    }
  });

  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Delete the "${campaign.name}" campaign card? This can't be undone.`)) return;
    deleteBtn.disabled = true;
    const { error } = await sb.from("campaigns").delete().eq("id", campaign.id);
    if (error) {
      errorMsg.textContent = "Delete failed: " + error.message;
      errorMsg.hidden = false;
      deleteBtn.disabled = false;
    } else {
      card.remove();
      loadCampaigns();
    }
  });

  card.appendChild(el("div", { class: "item-head" }, [el("span", { class: "tag", text: "CAMPAIGN" })]));
  card.appendChild(thumbRow);
  card.appendChild(el("p", { class: "img-hint", text: "Best size: 1200 × 480px · JPG or PNG · under 1MB. Landscape crops best." }));
  card.appendChild(grid);
  card.appendChild(actions);
  card.appendChild(status);
  card.appendChild(errorMsg);
  return card;
}

document.getElementById("add-campaign").addEventListener("click", async () => {
  const { error } = await sb.from("campaigns").insert({
    name: "New client",
    industry: "INDUSTRY",
    image_label: "CAMPAIGN IMAGE",
    m1_label: "REACH",
    m2_label: "ENGAGEMENT",
    sort_order: 999
  });
  if (error) {
    alert("Could not add campaign: " + error.message);
    return;
  }
  loadCampaigns();
});

/* ---------------------------------------------------------------------
   Articles
   --------------------------------------------------------------------- */
async function loadArticles() {
  const list = document.getElementById("article-list");
  list.innerHTML = "";
  const { data, error } = await sb.from("articles").select("*").order("sort_order", { ascending: true });
  if (error) {
    list.appendChild(el("p", { class: "error-msg", text: "Could not load articles: " + error.message }));
    return;
  }
  document.getElementById("article-count").textContent = String(data.length);
  data.forEach((a) => list.appendChild(renderArticleCard(a)));
}

function renderArticleCard(article) {
  const card = el("div", { class: "item-card" });
  const status = el("p", { class: "status-msg" });
  status.hidden = true;
  const errorMsg = el("p", { class: "error-msg" });
  errorMsg.hidden = true;

  const categoryInput = input(article.category, { placeholder: "STRATEGY" });
  const dateInput = input(article.date_label, { placeholder: "August 2026" });
  const titleInput = input(article.title, { placeholder: "Why consistency matters" });
  const descInput = input(article.description, { placeholder: "One line shown on the card" });
  const bodyInput = textarea(article.body, 8);
  const sortInput = input(String(article.sort_order ?? 0), { type: "number" });

  const urlHint = el("p", { class: "img-hint" });
  function updateUrlHint() {
    urlHint.textContent = `Publishes at: /insights/${slugify(titleInput.value)}.html`;
  }
  updateUrlHint();
  titleInput.addEventListener("input", updateUrlHint);

  const grid = el("div", { class: "row-2" });
  grid.appendChild(field("Category", categoryInput));
  grid.appendChild(field("Date", dateInput));
  const titleField = field("Title", titleInput);
  titleField.classList.add("span-2");
  grid.appendChild(titleField);
  const descField = field("Short description (shown on card)", descInput);
  descField.classList.add("span-2");
  grid.appendChild(descField);
  const bodyField = field("Article text (leave a blank line between paragraphs)", bodyInput);
  bodyField.classList.add("span-2");
  grid.appendChild(bodyField);
  grid.appendChild(field("Order (lower shows first)", sortInput));

  const actions = el("div", { style: "display:flex;gap:10px;margin-top:16px;" });
  const saveBtn = el("button", { type: "button", class: "btn btn-primary", text: "Save" });
  const deleteBtn = el("button", { type: "button", class: "btn btn-danger", text: "Delete" });
  actions.appendChild(saveBtn);
  actions.appendChild(deleteBtn);

  saveBtn.addEventListener("click", async () => {
    status.hidden = true;
    errorMsg.hidden = true;
    saveBtn.disabled = true;
    const update = {
      category: categoryInput.value.trim(),
      date_label: dateInput.value.trim(),
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      body: bodyInput.value,
      sort_order: Number(sortInput.value) || 0
    };
    const { error } = await sb.from("articles").update(update).eq("id", article.id);
    saveBtn.disabled = false;
    if (error) {
      errorMsg.textContent = "Save failed: " + error.message;
      errorMsg.hidden = false;
    } else {
      status.textContent = "Saved.";
      status.hidden = false;
    }
  });

  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Delete "${article.title}"? This can't be undone.`)) return;
    deleteBtn.disabled = true;
    const { error } = await sb.from("articles").delete().eq("id", article.id);
    if (error) {
      errorMsg.textContent = "Delete failed: " + error.message;
      errorMsg.hidden = false;
      deleteBtn.disabled = false;
    } else {
      card.remove();
      loadArticles();
    }
  });

  card.appendChild(el("div", { class: "item-head" }, [el("span", { class: "tag", text: "ARTICLE" })]));
  card.appendChild(urlHint);
  card.appendChild(grid);
  card.appendChild(actions);
  card.appendChild(status);
  card.appendChild(errorMsg);
  return card;
}

document.getElementById("add-article").addEventListener("click", async () => {
  const now = new Date();
  const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const { error } = await sb.from("articles").insert({
    category: "STRATEGY",
    date_label: monthLabel,
    title: "New article",
    sort_order: 0
  });
  if (error) {
    alert("Could not add article: " + error.message);
    return;
  }
  loadArticles();
});

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
checkSession();
sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    showView("reset");
    return;
  }
  // Don't bounce someone off the "forgot password" screen back to login --
  // they legitimately have no session yet at that point.
  if (!session && views.forgot.hidden && views.reset.hidden) {
    showView("login");
  }
});
