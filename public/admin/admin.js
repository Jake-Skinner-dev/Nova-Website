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
  dashboard: document.getElementById("view-dashboard")
};
function showView(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
}

/* ---------------------------------------------------------------------
   Auth
   --------------------------------------------------------------------- */
async function checkSession() {
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
sb.auth.onAuthStateChange((_event, session) => {
  if (!session) showView("login");
});
