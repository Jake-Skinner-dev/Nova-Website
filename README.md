# Nova Social Website

The production website for Nova Social — "Smart. Simple. Social." Built from the
approved **Nova Social website design** (Claude Design canvas), reproduced as a
static, framework-light site so it can run on standard shared/cPanel hosting.

## 1. Project overview

- One scrolling page (`index.html`) with anchor sections for Home, Services,
  Our Work, Insights, About and Contact — matching the nav in the approved design.
- Glassmorphism cards, floating hero panels, scroll-reveal animation, a mobile
  menu, a contact form modal and an article-reader modal for Insights posts.
- Brand colours: peach `#FEBE98`, dark blue/purple `#4F5277`, near-black `#07080E`.
- Fonts: Manrope (headings), Inter (body), loaded from Google Fonts.

## 2. Framework

Plain **Vite + vanilla HTML/CSS/JS** — no React/Next.js runtime, no persistent
Node server required. Vite is a build tool only: it bundles and minifies
`index.html`, `src/style.css` and `src/main.js` into a static `dist/` folder.
That output is plain files (HTML/CSS/JS/images) that any web server, including
123 Reg's cPanel shared hosting, can serve directly — no Node.js process needs
to run on the server.

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

- **Campaign cards ("Our Work")** — `index.html`, inside `<section id="work">`.
- **Insights articles** — the `<script type="application/json" id="articles-data">`
  block near the end of `index.html` (also update the matching card markup in
  `<section id="insights">`).
- **Contact recipient email** — `public/contact.php`.
- **Analytics** — commented placeholder block in `<head>` of `index.html` for
  GA4 / Meta Pixel / LinkedIn Insight Tag. No IDs are set — add them when
  confirmed.
- **Domain-specific SEO fields** — `<link rel="canonical">`, Open Graph URLs,
  `public/robots.txt` and `public/sitemap.xml` currently use a
  `YOUR-NOVA-DOMAIN.example` placeholder; replace with the real domain.
