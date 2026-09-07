# Nova Brief — content & ingestion API

Nova Brief has no application server. Its "API" is the Supabase project it
shares with Nova Social, plus the row contracts below. This document is the
integration point for the **future automated research / drafting system**.
No AI is built today — this only describes how a draft gets *in*, and the
guardrails that stop anything publishing itself.

---

## 1. Read side (already live)

The public site reads with the anon key. RLS (`brief-supabase-setup.sql`)
means the anon key can only ever see:

| Table              | Anon can read            |
|--------------------|--------------------------|
| `brief_articles`   | rows where `status = 'published'` |
| `brief_stats`      | rows where `status = 'published'` |
| `brief_editions`   | rows where `status = 'published'` |
| `brief_brands`     | all |
| `brief_authors`    | all |
| `brief_subscribers`| nothing (INSERT only) |

Drafts, review copies and scheduled-but-not-yet-live articles are **not
reachable** with the anon key.

The static article/section/sitemap/RSS pages are produced at build time by
`scripts/generate-articles.mjs`, which also reads only `status =
'published'` rows (and `published_at <= now()`).

---

## 2. Write side — the editorial workflow

`brief_articles.status` moves in one direction, by a human, in the admin
(`/admin/`):

```
draft → review → approved → scheduled → published → archived
```

`brief_articles.source` is `'human'` or `'ai'`. A database trigger
(`brief_ai_publish_guard`) enforces the core rule:

> **If `source = 'ai'` and the writer is not the signed-in editor, `status`
> is forced back to `'draft'` on every insert/update.**

So the ingestion path can create drafts (or mark them `review`), and
nothing more. Only a signed-in editor can move an AI-sourced article to
`approved` / `scheduled` / `published`.

---

## 3. Ingesting an AI draft

Two supported ways. Both create exactly one `brief_articles` row with
`source = 'ai'`, `status = 'draft'`.

### 3a. Edge Function (recommended) — `POST /functions/v1/ingest-draft`

Stub implementation: `supabase/functions/ingest-draft/index.ts`. Deploy
with `supabase functions deploy ingest-draft` and set two secrets:

```
supabase secrets set INGEST_TOKEN=<a long random string>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

The service-role key stays inside the function; callers only ever hold
`INGEST_TOKEN`.

**Request**

```
POST https://<project-ref>.functions.supabase.co/ingest-draft
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json
```

```jsonc
{
  "headline": "Hovis puts £4m behind a return to its 1973 brand cues",
  "standfirst": "One-sentence summary shown under the headline.",
  "body": "Full draft. Same block conventions as the CMS (see README).",
  "suggested_category": "Campaigns",          // maps to category
  "suggested_content_type": "Campaign Breakdown", // maps to content_type
  "tags": ["Hovis", "distinctive assets"],
  "brand": "Hovis",
  "source_name": "Publisher / wire name",
  "source_url": "https://example.com/original",
  "featured_image_url": "https://…/suggested.jpg",
  "seo_title": "Optional — defaults to headline",
  "meta_description": "Optional — defaults to standfirst",

  // Informational only — stored on the row, never affects publishing:
  "ai_score": 0.82,                            // story-relevance score 0–1
  "ai_sources": [                              // research trail
    { "title": "…", "url": "https://…", "publisher": "…" }
  ],
  "ai_model": "claude-sonnet-5",
  "ai_notes": "Why this was flagged / caveats for the editor."
}
```

**Response** `201`

```json
{ "id": "uuid", "slug": "hovis-puts-4m-behind…", "status": "draft",
  "review_url": "https://brief.novasocial.co.uk/admin/#articles" }
```

Only `headline` is required. Unknown fields are ignored. `slug` is derived
from the headline (deduped on write).

### 3b. Direct PostgREST insert (service role, server-side only)

```
POST https://<project-ref>.supabase.co/rest/v1/brief_articles
apikey: <service_role_key>
Authorization: Bearer <service_role_key>
Content-Type: application/json
Prefer: return=representation
```

```json
{ "source": "ai", "status": "draft", "headline": "…", "standfirst": "…",
  "body": "…", "category": "Campaigns", "content_type": "News",
  "tags": ["…"], "ai_score": 0.82, "ai_model": "claude-sonnet-5" }
```

The trigger still forces `status` to `draft` even if the payload asks for
more. Never put the service-role key in client code.

---

## 4. Mapping the planned 12-step system to fields

| Future step | Where it lands |
|---|---|
| 1. Monitor sources | external to this API |
| 2. Identify important stories | external |
| 3. Score story relevance | `ai_score` |
| 4. Research multiple sources | `ai_sources` (jsonb) |
| 5. Generate a draft | `body`, `standfirst` |
| 6. Generate SEO metadata | `seo_title`, `meta_description` |
| 7. Suggest category | `suggested_category` → `category` |
| 8. Suggest headline | `headline` |
| 9. Suggest featured image | `featured_image_url` |
| 10. Push the draft into Nova Brief | this endpoint |
| 11. Wait for human approval | `status` stays `draft`; editor reviews in `/admin/` |
| 12. Schedule / publish | editor sets `status` + `published_at`; next site build ships the page |

---

## 5. Other row contracts

**`brief_stats`** (`status='published'` to show):
`{ value: "£4m", caption: "…", category: "Campaigns", source_name, source_url, sponsor_name, sort_order }`

**`brief_editions`** — The Weekly Brief (`status='published'`, latest `week_of` shown):
`{ title, week_of: "2026-09-01", intro, items: [{ headline, summary, category, link }] }`

**`brief_subscribers`** — anon INSERT only:
`{ email, source: "web:home" }`

**`brief_brands`** / **`brief_authors`** — `{ slug, name, blurb|bio, logo_url|avatar_url }`.
Brand pages are also auto-created from the `brand` field on published articles.
