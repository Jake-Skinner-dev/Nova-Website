// Nova Brief — editor / CMS. Standalone page (not part of the Vite bundle)
// so it can be served as-is; supabase-js loads from a CDN. Reuses the same
// Supabase project as the parent Nova Social site; the signed-in editor
// account is the same one. Everything the public can see is gated by RLS
// (see brief/brief-supabase-setup.sql) — this page only *writes*.

const SUPABASE_URL = "https://whtsdbhnnwxgqfubkmxp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodHNkYmhubnd4Z3FmdWJrbXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzcwMDUsImV4cCI6MjEwMjgxMzAwNX0.LnH5rJzxiaxjQjrC3PcnkQ-UA0KP0feGYdI0WqiOeXY";
const IMAGE_BUCKET = "brief-images";
const ADMIN_URL = "https://brief.novasocial.co.uk/admin/";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ------------------------------------------------------------- views */
const views = {
  loading: document.getElementById("view-loading"),
  login: document.getElementById("view-login"),
  forgot: document.getElementById("view-forgot"),
  reset: document.getElementById("view-reset"),
  dashboard: document.getElementById("view-dashboard")
};
function showView(name) {
  Object.entries(views).forEach(([k, elm]) => (elm.hidden = k !== name));
}
const isRecovery =
  location.hash.includes("type=recovery") ||
  new URLSearchParams(location.search).get("type") === "recovery";

async function checkSession() {
  if (isRecovery) return showView("reset");
  const { data } = await sb.auth.getSession();
  if (data.session) {
    showView("dashboard");
    loadAll();
  } else {
    showView("login");
  }
}

/* --------------------------------------------------------- auth forms */
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const err = document.getElementById("login-error");
  const btn = document.getElementById("login-submit");
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = "Sign in";
  if (error) {
    err.textContent = "Incorrect email or password.";
    err.hidden = false;
    return;
  }
  showView("dashboard");
  loadAll();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  showView("login");
});

document.getElementById("show-forgot").addEventListener("click", () => {
  document.getElementById("forgot-error").hidden = true;
  document.getElementById("forgot-success").hidden = true;
  showView("forgot");
});
document.getElementById("show-login").addEventListener("click", () => showView("login"));

document.getElementById("forgot-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("forgot-email").value.trim();
  const err = document.getElementById("forgot-error");
  const ok = document.getElementById("forgot-success");
  const btn = document.getElementById("forgot-submit");
  err.hidden = true;
  ok.hidden = true;
  btn.disabled = true;
  btn.textContent = "Sending…";
  // Hardcoded (not location.origin) so a reset requested from a dev server
  // or preview still emails the real production admin URL.
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: ADMIN_URL });
  btn.disabled = false;
  btn.textContent = "Send reset link";
  if (error) {
    err.textContent = "Could not send reset link: " + error.message;
    err.hidden = false;
    return;
  }
  ok.hidden = false;
  document.getElementById("forgot-form").reset();
});

document.getElementById("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = document.getElementById("reset-password").value;
  const cf = document.getElementById("reset-confirm").value;
  const err = document.getElementById("reset-error");
  const btn = document.getElementById("reset-submit");
  err.hidden = true;
  if (pw !== cf) {
    err.textContent = "Passwords don't match.";
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  btn.textContent = "Updating…";
  const { error } = await sb.auth.updateUser({ password: pw });
  btn.disabled = false;
  btn.textContent = "Update password";
  if (error) {
    err.textContent = "Could not update password: " + error.message;
    err.hidden = false;
    return;
  }
  history.replaceState({}, "", location.pathname);
  showView("dashboard");
  loadAll();
});

sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") return showView("reset");
  if (!session && views.forgot.hidden && views.reset.hidden) showView("login");
});

/* --------------------------------------------------------------- tabs */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const tab = btn.dataset.tab;
    ["overview", "articles", "stats", "editions", "subscribers", "brands"].forEach((t) => {
      document.getElementById("tab-" + t).hidden = t !== tab;
    });
  });
});

/* ------------------------------------------------------------ helpers */
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
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "text") n.textContent = v;
    else if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  });
  kids.forEach((c) => c && n.appendChild(c));
  return n;
}
function val(id) {
  return document.getElementById(id).value;
}
function setVal(id, v) {
  const n = document.getElementById(id);
  if (n.type === "checkbox") n.checked = !!v;
  else n.value = v ?? "";
}
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function fmtShort(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function pill(status) {
  return el("span", { class: "pill " + status, text: status === "review" ? "in review" : status });
}

/* ============================================================ LOAD ALL */
async function loadAll() {
  await Promise.all([
    loadOverview(),
    loadArticles(),
    loadStats(),
    loadEditions(),
    loadSubscribers(),
    loadBrands()
  ]);
}

/* ---------------------------------------------------------- OVERVIEW */
async function loadOverview() {
  const grid = document.getElementById("stat-grid");
  const activity = document.getElementById("activity");
  grid.innerHTML = "";
  activity.innerHTML = "";

  const [{ data: articles }, { data: stats }, { data: editions }, { data: subs }] = await Promise.all([
    sb.from("brief_articles").select("id,status,source,headline,updated_at,published_at"),
    sb.from("brief_stats").select("id"),
    sb.from("brief_editions").select("id"),
    sb.from("brief_subscribers").select("id,created_at")
  ]);

  const A = articles || [];
  const now = Date.now();
  const since = (days) => now - days * 864e5;
  const count = (fn) => A.filter(fn).length;
  const box = (n, l, alert) =>
    el("div", { class: "stat-box" + (alert ? " alert" : "") }, [
      el("div", { class: "n", text: String(n) }),
      el("div", { class: "l", text: l })
    ]);

  grid.appendChild(box(count((a) => a.status === "published"), "Published"));
  grid.appendChild(box(count((a) => a.status === "draft"), "Drafts"));
  grid.appendChild(
    box(
      count((a) => a.status === "review"),
      "In review",
      count((a) => a.status === "review")
    )
  );
  grid.appendChild(box(count((a) => a.status === "scheduled"), "Scheduled"));
  grid.appendChild(
    box(count((a) => a.source === "ai" && ["draft", "review"].includes(a.status)), "AI drafts waiting", true)
  );
  grid.appendChild(
    box(count((a) => a.status === "published" && +new Date(a.published_at) > since(7)), "Published (7d)")
  );
  grid.appendChild(box((stats || []).length, "Killer Stats"));
  grid.appendChild(box((editions || []).length, "Weekly Briefs"));

  const subTotal = (subs || []).length;
  const sub7 = (subs || []).filter((s) => +new Date(s.created_at) > since(7)).length;
  grid.appendChild(box(subTotal, "Subscribers"));
  grid.appendChild(box(sub7, "Subscribers (7d)"));
  grid.appendChild(box(count((a) => a.status === "archived"), "Archived"));
  grid.appendChild(box(A.length, "Articles total"));

  A.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 10)
    .forEach((a) => {
      activity.appendChild(
        el("div", { class: "a-row" }, [
          el("span", { class: "a-t", text: a.headline || "(untitled)" }),
          pill(a.status),
          el("span", { class: "a-d", text: fmtShort(a.updated_at) })
        ])
      );
    });
  if (!A.length) activity.appendChild(el("p", { class: "hint", text: "No articles yet." }));
}

/* ---------------------------------------------------------- ARTICLES */
let ARTICLES = [];
let editingId = null;
let workingImageUrl = null;

async function loadArticles() {
  const { data, error } = await sb
    .from("brief_articles")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    document.getElementById("article-list").innerHTML =
      `<p class="msg err">Could not load: ${error.message}</p>`;
    return;
  }
  ARTICLES = data || [];
  renderArticleList();
}

function renderArticleList() {
  const list = document.getElementById("article-list");
  const q = document.getElementById("article-search").value.trim().toLowerCase();
  const sf = document.getElementById("article-status-filter").value;
  list.innerHTML = "";
  const rows = ARTICLES.filter(
    (a) =>
      (!sf || a.status === sf) &&
      (!q || (a.headline || "").toLowerCase().includes(q))
  );
  if (!rows.length) {
    list.appendChild(el("p", { class: "hint", text: "No articles match." }));
    return;
  }
  rows.forEach((a) => {
    const meta = el("div", { class: "r-meta", text: `${a.category || "—"} · ${a.content_type || "—"} · /${a.slug || slugify(a.headline)}` });
    const actions = el("div", { class: "r-actions" }, [
      el("button", { type: "button", class: "btn btn-ghost btn-sm", text: "Edit" })
    ]);
    actions.firstChild.addEventListener("click", () => openArticle(a.id));
    const pills = el("div", { style: "display:flex;gap:5px;align-items:center;" }, [
      a.source === "ai" ? el("span", { class: "pill ai", text: "AI" }) : null,
      pill(a.status)
    ]);
    list.appendChild(
      el("div", { class: "r" }, [
        el("div", {}, [el("div", { class: "r-title", text: a.headline || "(untitled)" }), meta]),
        pills,
        actions
      ])
    );
  });
}
document.getElementById("article-search").addEventListener("input", renderArticleList);
document.getElementById("article-status-filter").addEventListener("change", renderArticleList);

function showArticleList() {
  document.getElementById("article-editor-view").hidden = true;
  document.getElementById("articles-list-view").hidden = false;
}
function showArticleEditor() {
  document.getElementById("articles-list-view").hidden = true;
  document.getElementById("article-editor-view").hidden = false;
  document.getElementById("article-msg").hidden = true;
}
document.getElementById("article-back").addEventListener("click", () => {
  showArticleList();
  loadArticles();
  loadOverview();
});

function fillEditor(a) {
  editingId = a.id || null;
  workingImageUrl = a.featured_image_url || null;
  setVal("a-content_type", a.content_type || "News");
  setVal("a-category", a.category || "News");
  setVal("a-headline", a.headline || "");
  setVal("a-slug", a.slug || "");
  setVal("a-standfirst", a.standfirst || "");
  setVal("a-body", a.body || "");
  setVal("a-author", a.author || "Nova Brief");
  setVal("a-reading_minutes", a.reading_minutes || "");
  setVal("a-featured_image_url", a.featured_image_url || "");
  setVal("a-featured_image_alt", a.featured_image_alt || "");
  setVal("a-social_image_url", a.social_image_url || "");
  setVal("a-seo_title", a.seo_title || "");
  setVal("a-meta_description", a.meta_description || "");
  setVal("a-tags", Array.isArray(a.tags) ? a.tags.join(", ") : "");
  setVal("a-brand", a.brand || "");
  setVal("a-source_name", a.source_name || "");
  setVal("a-source_url", a.source_url || "");
  setVal("a-nova_take", a.nova_take || "");
  setVal("a-is_sponsored", a.is_sponsored);
  setVal("a-sponsor_name", a.sponsor_name || "");
  setVal("a-homepage_slot", a.homepage_slot || "none");
  setVal("a-sort_order", a.sort_order ?? 0);
  setVal("a-status", a.status || "draft");
  setVal("a-published_at", toLocalInput(a.published_at));
  document.getElementById("editor-status-pill").className = "pill " + (a.status || "draft");
  document.getElementById("editor-status-pill").textContent = a.status || "draft";
  document.getElementById("editor-ai-pill").hidden = a.source !== "ai";
  document.getElementById("ai-guard-note").hidden = a.source !== "ai";
  document.getElementById("article-delete").hidden = !a.id;
  document.getElementById("article-duplicate").hidden = !a.id;
  updateThumb();
  updateUrlHint();
}

function updateThumb() {
  const img = document.getElementById("a-thumb");
  const empty = document.getElementById("a-thumb-empty");
  const url = val("a-featured_image_url");
  if (url) {
    img.src = url;
    img.hidden = false;
    empty.style.display = "none";
  } else {
    img.hidden = true;
    empty.style.display = "flex";
  }
}
function updateUrlHint() {
  const slug = val("a-slug").trim() || slugify(val("a-headline"));
  document.getElementById("a-url-hint").textContent = `Publishes at: https://brief.novasocial.co.uk/${slug}`;
}
document.getElementById("a-headline").addEventListener("input", () => {
  if (!editingId && !val("a-slug").trim()) {
    // auto-fill slug for new articles until the editor types their own
    setVal("a-slug", slugify(val("a-headline")));
  }
  updateUrlHint();
});
document.getElementById("a-slug").addEventListener("input", updateUrlHint);
document.getElementById("a-featured_image_url").addEventListener("input", updateThumb);
document.getElementById("a-image-clear").addEventListener("click", () => {
  setVal("a-featured_image_url", "");
  workingImageUrl = null;
  updateThumb();
});
document.getElementById("a-image-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = document.getElementById("article-msg");
  msg.hidden = false;
  msg.className = "msg";
  msg.textContent = "Uploading image…";
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${editingId || "new"}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, file, { upsert: true });
  if (error) {
    msg.className = "msg err";
    msg.textContent = "Upload failed: " + error.message;
    return;
  }
  const { data } = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  setVal("a-featured_image_url", data.publicUrl);
  workingImageUrl = data.publicUrl;
  updateThumb();
  msg.hidden = true;
});

function collectEditor() {
  const tags = val("a-tags")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    content_type: val("a-content_type"),
    category: val("a-category"),
    headline: val("a-headline").trim(),
    slug: (val("a-slug").trim() || slugify(val("a-headline"))).slice(0, 80),
    standfirst: val("a-standfirst").trim(),
    body: val("a-body"),
    author: val("a-author").trim() || "Nova Brief",
    reading_minutes: val("a-reading_minutes") ? Number(val("a-reading_minutes")) : null,
    featured_image_url: val("a-featured_image_url").trim() || null,
    featured_image_alt: val("a-featured_image_alt").trim() || null,
    social_image_url: val("a-social_image_url").trim() || null,
    seo_title: val("a-seo_title").trim() || null,
    meta_description: val("a-meta_description").trim() || null,
    tags,
    brand: val("a-brand").trim() || null,
    source_name: val("a-source_name").trim() || null,
    source_url: val("a-source_url").trim() || null,
    nova_take: val("a-nova_take").trim() || null,
    is_sponsored: document.getElementById("a-is_sponsored").checked,
    sponsor_name: val("a-sponsor_name").trim() || null,
    homepage_slot: val("a-homepage_slot"),
    sort_order: Number(val("a-sort_order")) || 0,
    status: val("a-status"),
    published_at: fromLocalInput(val("a-published_at")),
    modified_at: new Date().toISOString()
  };
}

async function saveArticle(quickStatus) {
  const msg = document.getElementById("article-msg");
  msg.hidden = false;
  msg.className = "msg";
  msg.textContent = "Saving…";
  const payload = collectEditor();
  if (quickStatus) payload.status = quickStatus;
  if (!payload.headline) {
    msg.className = "msg err";
    msg.textContent = "A headline is required.";
    return;
  }
  // Publishing needs a timestamp so the generator's `published_at <= now`
  // filter includes it.
  if (["published", "scheduled"].includes(payload.status) && !payload.published_at) {
    payload.published_at = new Date().toISOString();
  }

  let res;
  if (editingId) {
    res = await sb.from("brief_articles").update(payload).eq("id", editingId).select().maybeSingle();
  } else {
    res = await sb.from("brief_articles").insert(payload).select().maybeSingle();
  }
  if (res.error) {
    msg.className = "msg err";
    msg.textContent = "Save failed: " + res.error.message;
    return;
  }
  fillEditor(res.data);
  msg.className = "msg ok";
  msg.textContent =
    res.data.source === "ai" && ["published", "scheduled", "approved"].includes(payload.status) && res.data.status === "draft"
      ? "Saved. Note: AI drafts are forced back to ‘draft’ — review and publish a human copy."
      : "Saved.";
  loadArticles();
}

document.getElementById("article-form").addEventListener("submit", (e) => {
  e.preventDefault();
  saveArticle();
});
document.querySelectorAll("[data-quick-status]").forEach((btn) => {
  btn.addEventListener("click", () => saveArticle(btn.dataset.quickStatus));
});
document.getElementById("article-delete").addEventListener("click", async () => {
  if (!editingId) return;
  if (!confirm("Delete this article? This can't be undone.")) return;
  const { error } = await sb.from("brief_articles").delete().eq("id", editingId);
  if (error) return alert("Delete failed: " + error.message);
  showArticleList();
  loadArticles();
  loadOverview();
});
document.getElementById("article-duplicate").addEventListener("click", async () => {
  const payload = collectEditor();
  delete payload.published_at;
  payload.status = "draft";
  payload.headline = payload.headline + " (copy)";
  payload.slug = slugify(payload.headline);
  const { data, error } = await sb.from("brief_articles").insert(payload).select().maybeSingle();
  if (error) return alert("Duplicate failed: " + error.message);
  await loadArticles();
  openArticle(data.id);
});

function openArticle(id) {
  const a = ARTICLES.find((x) => x.id === id);
  if (!a) return;
  fillEditor(a);
  showArticleEditor();
}
document.getElementById("new-article").addEventListener("click", () => {
  fillEditor({ status: "draft", author: "Nova Brief", category: "News", content_type: "News", sort_order: 0 });
  showArticleEditor();
});

/* ------------------------------------------------------- KILLER STATS */
async function loadStats() {
  const list = document.getElementById("stat-list");
  list.innerHTML = "";
  const { data, error } = await sb.from("brief_stats").select("*").order("sort_order", { ascending: true });
  if (error) {
    list.innerHTML = `<p class="msg err">${error.message}</p>`;
    return;
  }
  (data || []).forEach((s) => list.appendChild(statCard(s)));
  if (!data || !data.length) list.appendChild(el("p", { class: "hint", text: "No stats yet." }));
}
function statCard(s) {
  const card = el("div", { class: "r", style: "grid-template-columns:1fr;" });
  const box = el("div", { class: "card", style: "border:none;padding:0;" });
  const mk = (label, id, v, type) => {
    const i = el("input", { type: type || "text", id });
    i.value = v ?? "";
    return el("label", { class: "f" }, [el("span", { text: label }), i]);
  };
  const uid = s.id.slice(0, 6);
  const g = el("div", { class: "row-2" }, [
    mk("Figure (e.g. £4m, 73%, 1 in 3)", `s-value-${uid}`, s.value),
    mk("Category", `s-category-${uid}`, s.category)
  ]);
  const cap = mk("Caption", `s-caption-${uid}`, s.caption);
  cap.classList.add("span-2");
  const g2 = el("div", { class: "row-3" }, [
    mk("Source name", `s-source_name-${uid}`, s.source_name),
    mk("Source URL", `s-source_url-${uid}`, s.source_url),
    mk("Sort order", `s-sort_order-${uid}`, s.sort_order ?? 0, "number")
  ]);
  const g3 = el("div", { class: "row-2" }, [
    mk("Sponsor name (optional)", `s-sponsor_name-${uid}`, s.sponsor_name),
    (() => {
      const sel = el("select", { id: `s-status-${uid}` });
      ["published", "draft", "archived"].forEach((o) =>
        sel.appendChild(el("option", { value: o, text: o, ...(s.status === o ? { selected: "selected" } : {}) }))
      );
      return el("label", { class: "f" }, [el("span", { text: "Status" }), sel]);
    })()
  ]);
  const msg = el("p", { class: "msg", hidden: "hidden" });
  const actions = el("div", { style: "display:flex;gap:8px;margin-top:8px;" }, [
    el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Save" }),
    el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Delete" })
  ]);
  actions.children[0].addEventListener("click", async () => {
    msg.hidden = false;
    msg.className = "msg";
    msg.textContent = "Saving…";
    const { error } = await sb
      .from("brief_stats")
      .update({
        value: val(`s-value-${uid}`).trim(),
        category: val(`s-category-${uid}`).trim() || null,
        caption: val(`s-caption-${uid}`).trim(),
        source_name: val(`s-source_name-${uid}`).trim() || null,
        source_url: val(`s-source_url-${uid}`).trim() || null,
        sponsor_name: val(`s-sponsor_name-${uid}`).trim() || null,
        sort_order: Number(val(`s-sort_order-${uid}`)) || 0,
        status: val(`s-status-${uid}`)
      })
      .eq("id", s.id);
    msg.className = error ? "msg err" : "msg ok";
    msg.textContent = error ? error.message : "Saved.";
    loadOverview();
  });
  actions.children[1].addEventListener("click", async () => {
    if (!confirm("Delete this stat?")) return;
    await sb.from("brief_stats").delete().eq("id", s.id);
    loadStats();
    loadOverview();
  });
  box.append(g, cap, g2, g3, actions, msg);
  card.appendChild(box);
  return card;
}
document.getElementById("new-stat").addEventListener("click", async () => {
  const { error } = await sb.from("brief_stats").insert({ value: "00%", caption: "New stat", status: "draft", sort_order: 99 });
  if (error) return alert(error.message);
  loadStats();
});

/* ------------------------------------------------------ WEEKLY BRIEFS */
async function loadEditions() {
  const list = document.getElementById("edition-list");
  list.innerHTML = "";
  const { data, error } = await sb.from("brief_editions").select("*").order("week_of", { ascending: false });
  if (error) {
    list.innerHTML = `<p class="msg err">${error.message}</p>`;
    return;
  }
  (data || []).forEach((ed) => list.appendChild(editionCard(ed)));
  if (!data || !data.length) list.appendChild(el("p", { class: "hint", text: "No editions yet." }));
}
function editionCard(ed) {
  const uid = ed.id.slice(0, 6);
  const wrap = el("div", { class: "r", style: "grid-template-columns:1fr;" });
  const box = el("div", { class: "card", style: "border:none;padding:0;" });
  const mk = (label, id, v, type) => {
    const i = el("input", { type: type || "text", id });
    i.value = v ?? "";
    return el("label", { class: "f" }, [el("span", { text: label }), i]);
  };
  const g = el("div", { class: "row-3" }, [
    mk("Title", `e-title-${uid}`, ed.title || "5 marketing stories you need to know this week"),
    mk("Week of (date)", `e-week_of-${uid}`, ed.week_of, "date"),
    (() => {
      const sel = el("select", { id: `e-status-${uid}` });
      ["published", "draft", "archived"].forEach((o) =>
        sel.appendChild(el("option", { value: o, text: o, ...(ed.status === o ? { selected: "selected" } : {}) }))
      );
      return el("label", { class: "f" }, [el("span", { text: "Status" }), sel]);
    })()
  ]);
  const intro = mk("Intro line", `e-intro-${uid}`, ed.intro);
  intro.classList.add("span-2");
  box.append(g, intro, el("p", { class: "sub-head", text: "The five stories" }));

  const items = Array.isArray(ed.items) ? ed.items : [];
  for (let i = 0; i < 5; i++) {
    const it = items[i] || {};
    const row = el("div", { class: "row-2", style: "margin-bottom:6px;" }, [
      mk(`#${i + 1} Headline`, `e-h-${uid}-${i}`, it.headline),
      mk("Category", `e-c-${uid}-${i}`, it.category)
    ]);
    const row2 = el("div", { class: "row-2", style: "margin-bottom:14px;" }, [
      mk("Summary", `e-s-${uid}-${i}`, it.summary),
      mk("Link (URL or /slug)", `e-l-${uid}-${i}`, it.link)
    ]);
    box.append(row, row2);
  }

  const msg = el("p", { class: "msg", hidden: "hidden" });
  const actions = el("div", { style: "display:flex;gap:8px;" }, [
    el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Save" }),
    el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Delete" })
  ]);
  actions.children[0].addEventListener("click", async () => {
    const newItems = [];
    for (let i = 0; i < 5; i++) {
      const h = val(`e-h-${uid}-${i}`).trim();
      if (!h) continue;
      newItems.push({
        headline: h,
        category: val(`e-c-${uid}-${i}`).trim(),
        summary: val(`e-s-${uid}-${i}`).trim(),
        link: val(`e-l-${uid}-${i}`).trim()
      });
    }
    msg.hidden = false;
    msg.className = "msg";
    msg.textContent = "Saving…";
    const { error } = await sb
      .from("brief_editions")
      .update({
        title: val(`e-title-${uid}`).trim(),
        week_of: val(`e-week_of-${uid}`) || null,
        intro: val(`e-intro-${uid}`).trim() || null,
        items: newItems,
        status: val(`e-status-${uid}`),
        slug: slugify(val(`e-title-${uid}`) + "-" + (val(`e-week_of-${uid}`) || "")),
        published_at: val(`e-status-${uid}`) === "published" ? new Date().toISOString() : ed.published_at
      })
      .eq("id", ed.id);
    msg.className = error ? "msg err" : "msg ok";
    msg.textContent = error ? error.message : "Saved.";
    loadOverview();
  });
  actions.children[1].addEventListener("click", async () => {
    if (!confirm("Delete this edition?")) return;
    await sb.from("brief_editions").delete().eq("id", ed.id);
    loadEditions();
    loadOverview();
  });
  box.append(actions, msg);
  wrap.appendChild(box);
  return wrap;
}
document.getElementById("new-edition").addEventListener("click", async () => {
  const { error } = await sb.from("brief_editions").insert({
    title: "5 marketing stories you need to know this week",
    week_of: new Date().toISOString().slice(0, 10),
    status: "draft",
    items: []
  });
  if (error) return alert(error.message);
  loadEditions();
});

/* -------------------------------------------------------- SUBSCRIBERS */
let SUBSCRIBERS = [];
async function loadSubscribers() {
  const list = document.getElementById("subscriber-list");
  list.innerHTML = "";
  const { data, error } = await sb
    .from("brief_subscribers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    list.innerHTML = `<p class="msg err">${error.message} — is RLS letting the editor read this table?</p>`;
    return;
  }
  SUBSCRIBERS = data || [];
  document.getElementById("subscriber-count-line").textContent = `${SUBSCRIBERS.length} subscriber${SUBSCRIBERS.length === 1 ? "" : "s"}`;
  SUBSCRIBERS.slice(0, 200).forEach((s) => {
    list.appendChild(
      el("div", { class: "r", style: "grid-template-columns:1fr auto;" }, [
        el("div", {}, [
          el("div", { class: "r-title", text: s.email }),
          el("div", { class: "r-meta", text: `${s.source || "—"} · ${fmtShort(s.created_at)}` })
        ]),
        el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Remove" })
      ])
    );
    list.lastChild.querySelector("button").addEventListener("click", async () => {
      if (!confirm(`Remove ${s.email}?`)) return;
      await sb.from("brief_subscribers").delete().eq("id", s.id);
      loadSubscribers();
      loadOverview();
    });
  });
  if (!SUBSCRIBERS.length) list.appendChild(el("p", { class: "hint", text: "No subscribers yet." }));
}
document.getElementById("copy-subscribers").addEventListener("click", async () => {
  const csv = "email,source,created_at\n" + SUBSCRIBERS.map((s) => `${s.email},${s.source || ""},${s.created_at}`).join("\n");
  try {
    await navigator.clipboard.writeText(csv);
    alert(`Copied ${SUBSCRIBERS.length} rows to the clipboard.`);
  } catch {
    prompt("Copy the CSV:", csv);
  }
});

/* -------------------------------------------------------------- BRANDS */
async function loadBrands() {
  const list = document.getElementById("brand-list");
  list.innerHTML = "";
  const { data, error } = await sb.from("brief_brands").select("*").order("name", { ascending: true });
  if (error) {
    list.innerHTML = `<p class="msg err">${error.message}</p>`;
    return;
  }
  (data || []).forEach((b) => list.appendChild(brandCard(b)));
  if (!data || !data.length) list.appendChild(el("p", { class: "hint", text: "No brand pages yet." }));
}
function brandCard(b) {
  const uid = b.id.slice(0, 6);
  const box = el("div", { class: "card", style: "border:1px solid var(--rule);" });
  const mk = (label, id, v) => {
    const i = el("input", { type: "text", id });
    i.value = v ?? "";
    return el("label", { class: "f" }, [el("span", { text: label }), i]);
  };
  const g = el("div", { class: "row-2" }, [mk("Name", `b-name-${uid}`, b.name), mk("Slug", `b-slug-${uid}`, b.slug)]);
  const blurb = mk("Blurb", `b-blurb-${uid}`, b.blurb);
  const msg = el("p", { class: "msg", hidden: "hidden" });
  const actions = el("div", { style: "display:flex;gap:8px;" }, [
    el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Save" }),
    el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Delete" })
  ]);
  actions.children[0].addEventListener("click", async () => {
    msg.hidden = false;
    msg.className = "msg";
    msg.textContent = "Saving…";
    const { error } = await sb
      .from("brief_brands")
      .update({
        name: val(`b-name-${uid}`).trim(),
        slug: slugify(val(`b-slug-${uid}`) || val(`b-name-${uid}`)),
        blurb: val(`b-blurb-${uid}`).trim() || null
      })
      .eq("id", b.id);
    msg.className = error ? "msg err" : "msg ok";
    msg.textContent = error ? error.message : "Saved.";
  });
  actions.children[1].addEventListener("click", async () => {
    if (!confirm("Delete this brand page entry?")) return;
    await sb.from("brief_brands").delete().eq("id", b.id);
    loadBrands();
  });
  box.append(g, blurb, actions, msg);
  return box;
}
document.getElementById("new-brand").addEventListener("click", async () => {
  const name = prompt("Brand name:");
  if (!name) return;
  const { error } = await sb.from("brief_brands").insert({ name: name.trim(), slug: slugify(name) });
  if (error) return alert(error.message);
  loadBrands();
});

/* --------------------------------------------------------------- boot */
checkSession();
