# Nova Social Website

The production website for Nova Social — "Smart. Simple. Social." Built from the
approved **Nova Social website design** (Claude Design canvas), reproduced as a
static, framework-light site so it can run on standard shared/cPanel hosting.

## 1. Project overview

- A **multi-page site** — nine real pages, each its own URL, for SEO (unique
  title/description/canonical per page instead of one page with anchors):
  `index.html` (Home), `services.html` (overview), `marketing.html`,
  `branding.html`, `social-media.html` (the three individual services),
  `work.html`, `insights.html`, `about.html`, `contact.html`.
- Services has its own hover dropdown in the header nav (desktop) and a
  tap-to-expand submenu (mobile), linking straight to the three service pages
  — see `src/partials/header.html`.
- Shared chrome (header/nav, footer, contact/discovery/article modals) lives
  once in `src/partials/*.html` and is stitched into every page at build time
  by a small Vite plugin (see `vite.config.js`) — edit a partial once and it
  updates on every page. Each page's `<head>` (title, meta description,
  canonical, Open Graph) is unique and lives in that page's own file.
- Glassmorphism cards, floating hero panels, scroll-reveal animation, a mobile
  menu, a contact form modal and an article-reader modal for Insights posts.
- Brand colours: peach `#FEBE98`, dark blue/purple `#4F5277`, near-black `#07080E`.
- Fonts: Manrope (headings), Inter (body), loaded from Google Fonts.

## 2. Framework

Plain **Vite + vanilla HTML/CSS/JS** — no React/Next.js runtime, no persistent
Node server required. Vite is a build tool only: it bundles and minifies the
nine page HTML files, `src/style.css` and `src/main.js` into a static `dist/`
folder (see `rollupOptions.input` in `vite.config.js` for the multi-page
entry list). That output is plain files (HTML/CSS/JS/images) that any web
server, including 123 Reg's cPanel shared hosting, can serve directly — no
Node.js process needs to run on the server.

The one dynamic piece — the contact form — posts to `contact.php`, a small
dependency-free PHP script using `mail()`. Standard cPanel/LAMP hosting runs
PHP natively, so no extra runtime or Composer packages are needed.

## 3. Installation

```bash
npm install
```

Requires Node.js (used only on your machine / CI to build the site — never on
the live server).

## 4. Development

```bash
npm run dev
```

Starts a local dev server (default `http://localhost:5173`) with hot reload.
Note: the dev server does not execute PHP, so the contact form's "send" step
can only be fully tested once deployed (or with a local PHP server pointed at
`public/contact.php`). Client-side validation and the success/error UI states
work in dev regardless.

## 5. Production build

```bash
npm run build
```

Output goes to **`dist/`**. This folder is committed to the repository (it is
*not* git-ignored) so that cPanel's Git Version Control can deploy the site by
copying plain files — it never needs to run `npm install` or a build step on
the server.

**After every content/code change:**

```bash
npm run build
git add -A
git commit -m "Describe the change"
git push
```

Then pull/deploy in cPanel (see §9).

`npm run preview` serves the built `dist/` folder locally if you want to
sanity-check the production build before pushing.

## 6. Git workflow

- Default branch: **`main`**.
- Commit early and often; keep `dist/` in sync with `src/`/`index.html` by
  always running `npm run build` before committing.
- Never commit `.env` files, credentials, or `node_modules/` (see `.gitignore`).

## 7. GitHub repository

Repository: **`nova-social-website`** (created/connected as instructed — see
the chat summary for the exact URL).

## 8. cPanel deployment (123 Reg)

**Workflow:** Claude Code → GitHub → 123 Reg cPanel (Git Version Control) → live domain.

1. In cPanel, open **Git Version Control** → **Create**.
2. Clone URL: the GitHub repository URL (HTTPS, e.g.
   `https://github.com/<you>/nova-social-website.git`).
3. Repository path: something like `/home/<cpanel-username>/repositories/nova-social-website`
   (cPanel suggests a path — anywhere outside `public_html` is fine, since
   `.cpanel.yml` copies the built files into `public_html` for you).
4. Branch: **`main`**.
5. Edit **`.cpanel.yml`** in this repo and replace `USERNAME` in
   `/home/USERNAME/public_html/` with your actual cPanel username (shown in
   the cPanel Git Version Control screen, or in cPanel's top-right account
   info).
6. In cPanel Git Version Control, use **"Manage" → "Pull or Deploy" → "Update from Remote"**
   then **"Deploy HEAD Commit"** to run the tasks in `.cpanel.yml`, which copies
   the contents of `dist/` into `public_html/` (existing unrelated files in
   `public_html/` are left untouched — nothing is deleted).

### What reaches `public_html`

Everything inside `dist/` after `npm run build`: `index.html`,
`assets/*.css`/`*.js`/images, `favicon-*.png`, `apple-touch-icon.png`,
`robots.txt`, `sitemap.xml`, and `contact.php`.

### Future updates

1. You ask for a change.
2. The code is updated and `npm run build` is re-run.
3. Changes are committed and pushed to GitHub `main`.
4. In cPanel Git Version Control, click "Update from Remote" then
   "Deploy HEAD Commit" (or configure auto-deploy on push, if your 123 Reg
   plan's Git integration supports webhooks).

No manual file uploads needed.

### Rolling back a deployment

In cPanel Git Version Control, open the repository's "Pull or Deploy" screen —
past deployments are listed and can be re-deployed. Alternatively, from the
command line (via cPanel Terminal or SSH, if available):

```bash
cd /home/<cpanel-username>/repositories/nova-social-website
git log --oneline        # find the commit to roll back to
git reset --hard <commit-hash>
```

Then re-run "Deploy HEAD Commit" so `public_html` picks up the reverted files.
(`git reset --hard` rewrites the local deploy checkout only — coordinate with
whoever last pushed before doing this on a shared repo.)

## 9. Environment variables / secrets

This site has no build-time secrets or API keys. The one server-side setting
is the contact form's recipient address, set directly in
`public/contact.php` (`RECIPIENT_EMAIL` constant) rather than as an
environment variable, because `mail()` needs no credentials — it uses the
server's local mail transport. Update that constant with the real inbox
before going live.

If a future feature needs a real secret (an API key, etc.), add it as a
cPanel-side environment variable or a `.env` file that stays out of git
(already covered by `.gitignore`) — never commit it.

## 10. Content you'll likely want to edit

- **Header/footer nav, "Work With Nova" CTA** — `src/partials/header.html`
  and `src/partials/footer.html` (shared across all six pages).
- **Contact / discovery / article modals** — `src/partials/modal-*.html`
  (shared across all pages that include them).
- **Campaign cards ("Our Work")** — pulled from Supabase's `campaigns` table
  and rendered into `work.html`'s `<div id="work-grid">` by `src/main.js`.
- **Insights articles** — pulled from Supabase's `articles` table and
  rendered into `insights.html`'s `<div id="insights-grid">` by `src/main.js`.
- **Per-page copy** — each page's own file: `index.html`, `services.html`,
  `marketing.html`, `branding.html`, `social-media.html`, `work.html`,
  `insights.html`, `about.html`, `contact.html`.
- **Contact recipient email** — `public/contact.php`, and the mailto link on
  `contact.html`.
- **Analytics** — commented placeholder block in `src/partials/head-common.html`
  for GA4 / Meta Pixel / LinkedIn Insight Tag (shared by every page's
  `<head>`). No IDs are set — add them once here when confirmed.
- **Per-page SEO fields** — `<title>`, meta description, `<link rel="canonical">`
  and Open Graph tags live at the top of each page's own file (not shared),
  so they can target that page's own keywords. `public/robots.txt` and
  `public/sitemap.xml` list all six page URLs.
