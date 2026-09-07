-- =====================================================================
-- NOVA BRIEF — one-time Supabase setup.
-- Run in Supabase Studio → SQL Editor → New query → Run.
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE guards.
--
-- Nova Brief reuses the SAME Supabase project as the parent Nova Social
-- site. Everything here is namespaced brief_* and does not touch the
-- existing `campaigns` / `articles` tables or their policies.
--
-- Editor account: the same email used for the Nova Social admin. To give
-- Nova Brief its own login, change the address in brief_is_editor() below
-- (one place, used by every policy) and create that user in Supabase Auth.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.brief_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- brief_articles — the core editorial table
-- ---------------------------------------------------------------------
create table if not exists public.brief_articles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Editorial workflow. AI ingestion may only ever set 'draft' / 'review'
  -- (enforced by the trigger further down); a human moves it onward.
  status text not null default 'draft'
    check (status in ('draft','review','approved','scheduled','published','archived')),
  source text not null default 'human' check (source in ('human','ai')),

  content_type text not null default 'News'
    check (content_type in ('News','Campaign','Analysis','Opinion','Killer Stat',
                            'Weekly Brief','Campaign Breakdown','Nova Take','Sponsored')),
  category text not null default 'News',

  slug text unique,
  headline text not null default '',
  standfirst text not null default '',
  body text not null default '',
  author text not null default 'Nova Brief',

  featured_image_url text,
  featured_image_alt text,
  social_image_url text,

  seo_title text,
  meta_description text,
  tags text[] not null default '{}',
  brand text,

  source_name text,
  source_url text,

  nova_take text,
  is_sponsored boolean not null default false,
  sponsor_name text,

  homepage_slot text not null default 'none'
    check (homepage_slot in ('none','top_story','quick_read','campaign_of_week',
                             'story_of_week','focus_ai','focus_social','focus_brand','focus_advertising')),
  reading_minutes integer,
  sort_order integer not null default 0,

  published_at timestamptz,
  modified_at timestamptz,

  -- Scratch fields for the future automated research/draft system. Purely
  -- informational — nothing here changes site behaviour.
  ai_score numeric,
  ai_sources jsonb,
  ai_model text,
  ai_notes text
);

create index if not exists brief_articles_status_idx on public.brief_articles (status, published_at desc);
create index if not exists brief_articles_category_idx on public.brief_articles (category);
create index if not exists brief_articles_slot_idx on public.brief_articles (homepage_slot);

drop trigger if exists brief_articles_touch on public.brief_articles;
create trigger brief_articles_touch before update on public.brief_articles
  for each row execute function public.brief_touch_updated_at();

-- Optional future upgrade: Postgres full-text search instead of the
-- client-side filter in src/main.js. Uncomment to enable, then switch the
-- search page query to .textSearch('fts', term).
-- alter table public.brief_articles
--   add column if not exists fts tsvector
--   generated always as (to_tsvector('english',
--     coalesce(headline,'') || ' ' || coalesce(standfirst,'') || ' ' ||
--     coalesce(body,'') || ' ' || coalesce(brand,'') || ' ' || array_to_string(tags,' '))) stored;
-- create index if not exists brief_articles_fts_idx on public.brief_articles using gin (fts);

-- ---------------------------------------------------------------------
-- AI publish guard — ingestion can never push past 'review'.
-- A signed-in editor (auth.role() = 'authenticated') is unaffected and
-- can move an AI-sourced article all the way to 'published' after review.
-- ---------------------------------------------------------------------
create or replace function public.brief_ai_publish_guard()
returns trigger language plpgsql as $$
begin
  if new.source = 'ai'
     and coalesce(auth.role(), '') <> 'authenticated'
     and new.status not in ('draft','review') then
    new.status := 'draft';
  end if;
  return new;
end $$;

drop trigger if exists brief_articles_ai_guard on public.brief_articles;
create trigger brief_articles_ai_guard before insert or update on public.brief_articles
  for each row execute function public.brief_ai_publish_guard();

-- ---------------------------------------------------------------------
-- brief_stats — homepage "Killer Stats"
-- ---------------------------------------------------------------------
create table if not exists public.brief_stats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  value text not null default '',
  caption text not null default '',
  category text,
  source_name text,
  source_url text,
  sponsor_name text,
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('published','draft','archived'))
);

-- ---------------------------------------------------------------------
-- brief_editions — "The Weekly Brief"
-- ---------------------------------------------------------------------
create table if not exists public.brief_editions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null default '5 marketing stories you need to know this week',
  week_of date,
  intro text,
  items jsonb not null default '[]'::jsonb,   -- [{headline, summary, category, link}]
  slug text unique,
  status text not null default 'draft' check (status in ('published','draft','archived')),
  published_at timestamptz
);

-- ---------------------------------------------------------------------
-- brief_subscribers — newsletter signups (anon may INSERT only)
-- ---------------------------------------------------------------------
create table if not exists public.brief_subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  source text,
  confirmed boolean not null default false
);

-- ---------------------------------------------------------------------
-- brief_brands / brief_authors — expandable, optional
-- ---------------------------------------------------------------------
create table if not exists public.brief_brands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text unique,
  name text not null default '',
  blurb text,
  logo_url text
);
create table if not exists public.brief_authors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text unique,
  name text not null default '',
  role text,
  bio text,
  avatar_url text
);

-- =====================================================================
-- Row Level Security
--   public (anon)  : SELECT only published articles / stats / editions;
--                    INSERT into brief_subscribers; nothing else.
--   editor (email) : full access to everything.
-- =====================================================================
alter table public.brief_articles   enable row level security;
alter table public.brief_stats      enable row level security;
alter table public.brief_editions   enable row level security;
alter table public.brief_subscribers enable row level security;
alter table public.brief_brands     enable row level security;
alter table public.brief_authors    enable row level security;

-- Helper: is the current request the signed-in editor? The email is the
-- single source of truth for every policy below — change it here only.
create or replace function public.brief_is_editor()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'jake@novasocial.co.uk', false);
$$;

-- brief_articles
drop policy if exists "brief_articles public read published" on public.brief_articles;
create policy "brief_articles public read published" on public.brief_articles
  for select using (status = 'published' or public.brief_is_editor());
drop policy if exists "brief_articles editor writes" on public.brief_articles;
create policy "brief_articles editor writes" on public.brief_articles
  for all to authenticated using (public.brief_is_editor()) with check (public.brief_is_editor());

-- brief_stats
drop policy if exists "brief_stats public read published" on public.brief_stats;
create policy "brief_stats public read published" on public.brief_stats
  for select using (status = 'published' or public.brief_is_editor());
drop policy if exists "brief_stats editor writes" on public.brief_stats;
create policy "brief_stats editor writes" on public.brief_stats
  for all to authenticated using (public.brief_is_editor()) with check (public.brief_is_editor());

-- brief_editions
drop policy if exists "brief_editions public read published" on public.brief_editions;
create policy "brief_editions public read published" on public.brief_editions
  for select using (status = 'published' or public.brief_is_editor());
drop policy if exists "brief_editions editor writes" on public.brief_editions;
create policy "brief_editions editor writes" on public.brief_editions
  for all to authenticated using (public.brief_is_editor()) with check (public.brief_is_editor());

-- brief_subscribers — anon INSERT, editor SELECT/UPDATE/DELETE
drop policy if exists "brief_subscribers anon signup" on public.brief_subscribers;
create policy "brief_subscribers anon signup" on public.brief_subscribers
  for insert to anon, authenticated with check (true);
drop policy if exists "brief_subscribers editor read" on public.brief_subscribers;
create policy "brief_subscribers editor read" on public.brief_subscribers
  for select to authenticated using (public.brief_is_editor());
drop policy if exists "brief_subscribers editor manage" on public.brief_subscribers;
create policy "brief_subscribers editor manage" on public.brief_subscribers
  for delete to authenticated using (public.brief_is_editor());

-- brief_brands / brief_authors — public read, editor write
drop policy if exists "brief_brands public read" on public.brief_brands;
create policy "brief_brands public read" on public.brief_brands for select using (true);
drop policy if exists "brief_brands editor writes" on public.brief_brands;
create policy "brief_brands editor writes" on public.brief_brands
  for all to authenticated using (public.brief_is_editor()) with check (public.brief_is_editor());

drop policy if exists "brief_authors public read" on public.brief_authors;
create policy "brief_authors public read" on public.brief_authors for select using (true);
drop policy if exists "brief_authors editor writes" on public.brief_authors;
create policy "brief_authors editor writes" on public.brief_authors
  for all to authenticated using (public.brief_is_editor()) with check (public.brief_is_editor());

-- ---------------------------------------------------------------------
-- Storage bucket for article images
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('brief-images', 'brief-images', true)
on conflict (id) do nothing;

drop policy if exists "brief-images public read" on storage.objects;
create policy "brief-images public read" on storage.objects
  for select using (bucket_id = 'brief-images');
drop policy if exists "brief-images editor write" on storage.objects;
create policy "brief-images editor write" on storage.objects
  for all to authenticated
  using (bucket_id = 'brief-images' and public.brief_is_editor())
  with check (bucket_id = 'brief-images' and public.brief_is_editor());

-- =====================================================================
-- Seed content — only inserts when the table is empty, so re-running is
-- safe. Gives a fresh install a working homepage + real article pages.
-- =====================================================================
insert into public.brief_articles
  (slug, status, source, content_type, category, headline, standfirst, body, author,
   brand, nova_take, source_name, source_url, tags, homepage_slot, reading_minutes,
   published_at, seo_title, meta_description)
select * from (values
  (
    'hovis-4m-brand-campaign', 'published', 'human', 'Campaign Breakdown', 'Campaigns',
    'Hovis just spent £4m reminding Britain why it knows its brand',
    'The bread maker''s biggest push in a decade leans hard on nostalgia and distinctive assets — and it''s a masterclass in spending media money on what a brand already owns.',
    E'Hovis has brought back its 1973 "Boy on the Bike" cue — the cobbled hill, the brass-band score, the Yorkshire accent — across TV, cinema, out-of-home and retail media, with almost no new brand-building beyond it.\n\n## What actually happened\n\nThe campaign, made with Publicis Poke, is reportedly a £4m media investment. That is a big number for Hovis and a small one next to the category''s biggest spenders. Nearly all of it sits behind a single, decades-old idea.\n\n> In a category where own-label keeps gaining, Hovis is spending to stay the brand people picture when they think "bread".\n\n## Why it matters\n\nIt is a clean bet on mental availability over novelty. Distinctive assets only work if you keep paying to remind people of them, and plenty of brands quietly retire theirs to look modern. Hovis is doing the opposite.\n\n[[stat: £4m | The reported media investment behind the campaign — Hovis'' biggest in over a decade. | https://brief.novasocial.co.uk/hovis-4m-brand-campaign]]\n\nThe risk is not the idea. It is whether £4m is enough weight behind it to move a share point in a huge, low-interest category.',
    'Nova Brief', 'Hovis',
    'Reassuringly boring, in the best way. The smartest media plans often spend money on what the brand already owns rather than chasing something new.',
    'Nova Brief analysis', null,
    ARRAY['Hovis','distinctive assets','brand building','FMCG'],
    'campaign_of_week', 4, now() - interval '1 hour',
    'Hovis''s £4m brand campaign, broken down', 'Why Hovis put £4m behind a near-total return to its 1973 brand cues — and what it says about spending on distinctive assets.'
  ),
  (
    'asda-brand-refresh-2026', 'published', 'human', 'News', 'Branding',
    'Asda unveils a full brand refresh as it fights to win back shoppers',
    'New logo lock-up, a warmer palette and a "price" platform front and centre. The supermarket says it''s the biggest identity change in 15 years.',
    E'Asda has rolled out a refreshed identity across stores, packaging and advertising — its most significant visual change since 2011.\n\nThe green stays, but it is warmer; the wordmark sits in a softer lock-up; and "price" has been pushed to the centre of the system rather than treated as a promotional add-on.\n\n## The read\n\nA refresh will not fix a positioning problem on its own. Asda''s challenge is share loss to both the discounters below it and a resurgent Sainsbury''s and Tesco above it. A clearer, more confident identity helps — but only if the price promise behind it is real.',
    'Nova Brief', 'Asda', null,
    'Company announcement', null,
    ARRAY['Asda','retail','rebrand','supermarkets'],
    'top_story', 3, now() - interval '3 hours',
    null, 'Asda has launched its biggest brand refresh in 15 years, with price pushed to the centre of the identity.'
  ),
  (
    'instagram-trial-reverse-chronological', 'published', 'human', 'News', 'Social',
    'Instagram tests a reverse-chronological main feed for all users',
    'An opt-in toggle is rolling out in the UK and US. Adam Mosseri says it''s "a response to what people keep asking for", not a change to the default.',
    E'Instagram has begun testing an opt-in setting that shows the main feed in reverse-chronological order, rolling out first in the UK and US.\n\nThe default ranked feed is not changing. The toggle resets each session rather than sticking, which limits how many people will use it day to day.\n\n## What it means for marketers\n\nNot much, yet. Reach is still overwhelmingly ranked. But it is a signal worth watching: every chronological experiment so far has fed back into how the ranked feed weights recency.',
    'Nova Brief', 'Instagram', null,
    'Adam Mosseri', null,
    ARRAY['Instagram','Meta','social platforms','feed ranking'],
    'quick_read', 2, now() - interval '1 day',
    null, 'Instagram is testing an opt-in chronological main feed in the UK and US — the default ranking is unchanged.'
  ),
  (
    'uncommon-wins-british-airways', 'published', 'human', 'News', 'Agencies',
    'Uncommon wins British Airways'' global creative account',
    'The airline consolidates with a single shop after a four-way pitch. First work is expected in early 2027, built around a refreshed platform.',
    E'British Airways has appointed Uncommon Creative Studio as its global creative agency following a four-way competitive pitch.\n\nThe account was previously split across several shops. Consolidation gives BA a single creative custodian for a brand platform it has struggled to land consistently since "To fly. To serve."\n\n## The read\n\nUncommon has a strong record turning heritage brands into modern, emotionally-led campaigns. The question is whether an airline''s operational realities — delays, pricing, loyalty changes — leave enough room for the kind of work Uncommon is known for.',
    'Nova Brief', 'British Airways', null,
    'Agency statement', null,
    ARRAY['British Airways','Uncommon','account moves','airlines'],
    'quick_read', 3, now() - interval '2 days',
    null, 'British Airways has appointed Uncommon as its global creative agency after a four-way pitch.'
  ),
  (
    'what-marketers-need-to-know-ai-search', 'published', 'human', 'Analysis', 'AI',
    'What marketers actually need to know about AI search this quarter',
    'Cutting through the noise: where AI-generated answers are actually changing traffic, and the three things worth doing now.',
    E'AI answers are now a standard part of the search results page for a large share of informational queries. The effect on brand traffic is real but uneven.\n\n## Where it bites\n\nTop-of-funnel, "what is / how do I" content is losing clicks to summarised answers. Transactional and branded queries are largely unaffected so far.\n\n## Three things worth doing now\n\n- Audit which of your top landing pages serve purely informational intent — those are the exposed ones.\n- Make sure your best factual content is genuinely citable: clear claims, clear sourcing, structured data.\n- Track branded search volume as a proxy for the demand your other channels are creating.\n\n> The brands doing well in AI answers are the ones that were already the clearest, best-structured sources on their topic.',
    'Nova Brief', null, null,
    'Nova Brief analysis', null,
    ARRAY['AI search','SEO','content strategy','generative engines'],
    'quick_read', 6, now() - interval '2 days',
    null, 'Where AI-generated search answers are actually changing brand traffic — and the three things worth doing about it now.'
  ),
  (
    'retail-media-second-wave', 'published', 'human', 'Analysis', 'Digital',
    'Retail media''s second wave is here — and it''s coming for brand budgets, not just trade spend',
    'For five years retail media was funded out of shopper marketing. Nova Brief spoke to eight brand and agency leaders about why that''s changing.',
    E'Retail media networks have spent five years growing on trade and shopper-marketing money. The next phase is different: networks want brand budgets, and they are building the ad formats to justify it.\n\n## What "full-funnel retail media" means in practice\n\nOff-site display and video bought against a retailer''s first-party data; connected-TV inventory sold by the retailer; in-store digital screens measured against sales lift. The pitch is closed-loop measurement on upper-funnel spend.\n\n## Where it still falls down\n\nMeasurement is inconsistent between networks, incrementality testing is rare, and "sales lift" often is not adjusted for what would have sold anyway.\n\n> Every leader we spoke to is spending more on retail media next year. Not one was fully confident in how it is measured.\n\n[[stat: 1 in 3 | UK product searches now start on a retail media network rather than Google or a brand site. | ]]\n\nThe brands getting value are treating retail media as a testable channel with its own hypotheses — not as a tax on doing business with a retailer.',
    'Nova Brief', null,
    'The winners here will be the brands that demand the same measurement rigour from retail media that they''d expect from any other channel.',
    'Nova Brief reporting', null,
    ARRAY['retail media','commerce','measurement','media planning'],
    'story_of_week', 8, now() - interval '4 days',
    null, 'Retail media is moving from trade spend to brand budgets. Eight brand and agency leaders on what that changes — and where measurement still falls down.'
  ),
  (
    'nova-take-ai-content-missing-the-point', 'published', 'human', 'Nova Take', 'AI',
    'Why everyone chasing AI content is missing the point',
    'The bottleneck was never how fast you could publish.',
    E'The promise of AI content tools is volume: more posts, more pages, more variants, faster. But for most brands, volume was never the constraint.\n\nThe constraint was having something worth saying, and the judgement to know which ideas were worth the effort. AI does not fix either of those. It just makes it cheaper to fill the gap with things nobody asked for.\n\n> If your content had a reason to exist before AI, these tools will help you make more of it. If it didn''t, they''ll help you make that problem bigger.\n\nUse the time AI gives back on the part that was always hard: deciding what actually deserves to be published.',
    'Nova Brief', null, null,
    null, null,
    ARRAY['AI','content strategy','opinion'],
    'focus_ai', 3, now() - interval '5 days',
    null, 'AI content tools solve for volume. For most brands, volume was never the problem.'
  ),
  (
    'lidl-christmas-2026-teaser', 'published', 'human', 'News', 'Campaigns',
    'Lidl kicks off the Christmas ad race early with a raccoon and a wink at John Lewis',
    'A 15-second teaser dropped this week — a full three months out. The discounter is betting that being first is worth more than being polished.',
    E'Lidl has released a short teaser for its Christmas campaign in early September, well ahead of the traditional November window.\n\nThe spot is light on story and heavy on brand cues: the Lidl blue, the value message, and a knowing nod to the John Lewis format it is positioning against.\n\n## The read\n\nGoing early is a media strategy as much as a creative one. Impressions are cheaper now, share of voice is easier to win, and the campaign gets more weeks on air for the same idea.',
    'Nova Brief', 'Lidl', null,
    'Brand social channels', null,
    ARRAY['Lidl','Christmas advertising','retail','seasonal'],
    'none', 2, now() - interval '5 days',
    null, 'Lidl has released a Christmas campaign teaser in early September, betting that being first beats being polished.'
  )
) as v(slug, status, source, content_type, category, headline, standfirst, body, author,
       brand, nova_take, source_name, source_url, tags, homepage_slot, reading_minutes,
       published_at, seo_title, meta_description)
where not exists (select 1 from public.brief_articles);

insert into public.brief_stats (value, caption, category, source_name, source_url, sort_order, status)
select * from (values
  ('£4m', 'The reported media investment behind Hovis'' latest brand campaign — its biggest in over a decade.', 'Campaigns', 'Nova Brief analysis', 'https://brief.novasocial.co.uk/hovis-4m-brand-campaign', 1, 'published'),
  ('73%', 'of marketers say they''ve cut content volume this year and shifted budget to fewer, bigger ideas.', 'Trends', 'Nova Brief reader survey, Aug 2026', null, 2, 'published'),
  ('1 in 3', 'UK product searches now start on a retail media network rather than Google or a brand site.', 'Digital', 'Industry estimate, 2026', null, 3, 'published')
) as v(value, caption, category, source_name, source_url, sort_order, status)
where not exists (select 1 from public.brief_stats);

insert into public.brief_editions (title, week_of, intro, items, slug, status, published_at)
select
  '5 marketing stories you need to know this week',
  date '2026-09-01',
  'Week of 1 September 2026 — the campaigns, moves and numbers that actually mattered.',
  '[
    {"headline":"Hovis puts £4m behind a near-total return to its 1973 brand cues","summary":"A clean bet on distinctive assets and mental availability over anything new.","category":"Campaigns","link":"/hovis-4m-brand-campaign"},
    {"headline":"Uncommon takes British Airways'' global creative account","summary":"A single-shop consolidation after a four-way pitch; first work in 2027.","category":"Agencies","link":"/uncommon-wins-british-airways"},
    {"headline":"Instagram trials a chronological main feed","summary":"Opt-in only, UK and US first — not a change to the default ranking.","category":"Social","link":"/instagram-trial-reverse-chronological"},
    {"headline":"Retail media''s second wave targets brand budgets","summary":"Networks are building full-funnel formats — and the measurement gap is showing.","category":"Digital","link":"/retail-media-second-wave"},
    {"headline":"Asda ships its biggest brand refresh in 15 years","summary":"New lock-up, warmer palette, and price pushed to the centre of the identity.","category":"Branding","link":"/asda-brand-refresh-2026"}
  ]'::jsonb,
  '5-marketing-stories-2026-09-01',
  'published',
  now() - interval '2 days'
where not exists (select 1 from public.brief_editions);

insert into public.brief_brands (slug, name, blurb)
select * from (values
  ('hovis', 'Hovis', 'One of Britain''s best-known bread brands, and a recurring case study in distinctive-asset marketing.'),
  ('asda', 'Asda', 'The UK''s third-largest supermarket, working through a brand and positioning reset.'),
  ('british-airways', 'British Airways', 'The UK flag carrier and its long search for a consistent modern brand platform.')
) as v(slug, name, blurb)
where not exists (select 1 from public.brief_brands);
