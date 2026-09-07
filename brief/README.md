# Nova Brief

**Marketing news that matters.** A publication by Nova Social, living at
`brief.novasocial.co.uk`. Independent of the main Nova Social site — its own
design, its own build, its own deploy — while sharing the same Supabase
project.

Same family as `novasocial.co.uk` and Nova OS (peach `#FEBE98`, Manrope +
Inter, soft rounded language, minimal UI); its own personality (a light
editorial "paper" surface, a Fraunces serif accent for standfirsts and
pull quotes, numbered editorial navigation, franchise sections).

---

## 1. Stack

Plain **Vite + vanilla HTML / CSS / JS** — no framework, no server. Vite
bundles the pages, `src/style.css` and `src/main.js` into a static
`dist/`. Dynamic content (articles, stats, the Weekly Brief, newsletter
signups) is read from **Supabase** with the public anon key; Row Level
Security means the anon key can only ever see `status = 'published'` rows.

```
brief/
  index.html              editorial homepage
  news.html … stats.html  section landings (9 franchises)
  about / newsletter / search / article / 404
  src/
    style.css             the design system
    main.js               masthead, reveal, homepage hydration, search, newsletter
    article.js            dev-only article preview (?slug=)
    partials/*.html        masthead, footer, CTAs, ad slot
  scripts/generate-articles.mjs   build-time static page + sitemap + RSS generator
  public/
    admin/                the CMS (login, overview, article editor, stats, editions)
    .htaccess robots.txt icons
  brief-supabase-setup.sql   run once in Supabase Studio
  API.md                     AI-ingestion contract
  supabase/functions/ingest-draft/   ingestion endpoint stub
```

## 2. First-time setup

1. **Database** — open Supabase Studio → SQL Editor, paste
   `brief-supabase-setup.sql`, Run. Creates the `brief_*` tables, RLS
   policies, the `brief-images` storage bucket, the AI publish-guard
   trigger, and seed content. Safe to re-run.
2. **Editor login** — the SQL grants write access to
   `jake@novasocial.co.uk` (the existing Nova Social admin account). To use
   a different account, change the address in `brief_is_editor()` and
   create that user in Supabase Auth.
3. `npm install` (Node 20+).

## 3. Develop

```bash
npm run dev
```

`http://localhost:5173`. The homepage renders its hand-written seed markup,
then replaces each section with live Supabase rows if any exist. Individual
article pages preview at `/article.html?slug=<slug>` in dev (production
serves real static files — see below).

## 4. Build

```bash
npm run build
```

Runs `vite build`, then `scripts/generate-articles.mjs`, which writes into
`dist/`:

- `dist/<slug>.html` — one editorial page per **published** article, each
  with its own `<title>` / meta description / canonical / Open Graph /
  Twitter card / `NewsArticle` + `BreadcrumbList` JSON-LD.
- `dist/<section>.html` — the 9 section landings, populated (overwrites the
  dev shells).
- `dist/brands/<slug>.html` — a page per brand that has published stories.
- `dist/sitemap.xml`, `dist/rss.xml`.

`dist/` is committed (like the parent site) so the host never runs a build.
Articles published in the admin appear on the site **after the next build +
deploy** — same model as the parent site's Insights pages.

## 5. Deploy — `brief.novasocial.co.uk`

Set up as a **second, separate** cPanel Git Version Control clone of this
repo (independent of the one serving `novasocial.co.uk`):

1. cPanel → Git Version Control → Create; clone URL = this repo; branch
   `main`; repository path anywhere outside a document root.
2. Confirm the document root for `brief.novasocial.co.uk` (cPanel → Domains)
   and set `DEPLOYPATH` in `brief/.cpanel.yml` to match.
3. Manage → Pull or Deploy → Update from Remote, then Deploy HEAD Commit.
   `brief/.cpanel.yml` copies `brief/dist/` into that document root and
   places `.htaccess` (clean URLs, 404, caching).

**Update flow:** make changes → `npm run build` → commit `brief/` (incl.
`brief/dist/`) → push → Deploy HEAD Commit in the Brief cPanel repo.

*Vercel alternative:* new project, root directory `brief`, build
`npm run build`, output `dist`, domain `brief.novasocial.co.uk`.

*Optional automation:* `.github/workflows/rebuild-brief.yml` rebuilds
`brief/dist/` every 30 minutes and commits it if published content changed
(so publishing in the admin doesn't need a manual build). Delete the file
to turn it off.

## 6. Writing in the CMS

`/admin/` → sign in.

- **Overview** — live counts (published, drafts, in review, scheduled, AI
  drafts waiting, subscribers, …) and recent activity.
- **Articles** — list + filter; **+ New article** opens the full editor.
  Workflow: `draft → review → approved → scheduled → published → archived`.
  Quick buttons for each transition; publishing sets `published_at`.
- **Killer Stats**, **Weekly Briefs**, **Subscribers** (read + CSV),
  **Brands**.

### Body formatting

Plain text with a few markers (identical in the CMS, the dev preview and
the generator):

| Write | Get |
|---|---|
| blank line between blocks | paragraphs |
| `## Heading` | section subhead |
| `### Heading` | smaller subhead |
| `> A line` | pull quote |
| `- item` (consecutive lines) | bullet list |
| `[[stat: 73% \| short caption \| https://source]]` | in-body Killer Stat (caption & source optional) |
| `[text](https://url)` | link |
| `**text**` | bold |

## 7. The future AI content system

Nothing AI-driven is built. `API.md` documents the ingestion contract and
`supabase/functions/ingest-draft/` is a deployable stub. The rule, enforced
by the `brief_ai_publish_guard` database trigger: **an AI-sourced row can
never be set past `review` except by the signed-in editor.** A person
always approves and publishes.

## 8. Advertising

Nova Brief ships with **no ads**. `src/partials/ad-slot.html` +
`.ad-slot` styles are reusable placeholders, hidden until a slot gets
`is-live`. Documented placements: below-header, in-feed, article-mid,
article-end, newsletter-sponsor, killer-stat-sponsor, campaign-sponsor.
Stats and Campaign of the Week already have a `sponsor_name` field.

## 9. Notes / to-do

- The favicon and `og-default.png` in `public/` are Nova Social's, used as
  placeholders — swap in Nova Brief artwork before launch.
- `src/supabaseClient.js`, `scripts/generate-articles.mjs`,
  `public/admin/admin.js` and `supabase/functions/ingest-draft/` each carry
  the Supabase URL + anon key inline (the anon key is public by design, as
  on the parent site). Keep them in sync if the project ever changes.
