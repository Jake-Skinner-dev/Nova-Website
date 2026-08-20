-- Nova Social — one-time Supabase setup.
-- Run this in Supabase Studio → SQL Editor → New query → Run.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT guards.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  name text not null default '',
  industry text not null default '',
  challenge text not null default '',
  services text not null default '',
  m1_label text not null default 'REACH',
  m1_value text not null default '',
  m2_label text not null default 'ENGAGEMENT',
  m2_value text not null default '',
  image_url text,
  image_label text not null default 'CAMPAIGN IMAGE',
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  category text not null default '',
  date_label text not null default '',
  title text not null default '',
  description text not null default '',
  body text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Row Level Security: anyone can read, only signed-in users can write.
-- Since you're the only person with a login, "authenticated" == you.
-- ---------------------------------------------------------------------
alter table public.campaigns enable row level security;
alter table public.articles enable row level security;

drop policy if exists "Public can read campaigns" on public.campaigns;
create policy "Public can read campaigns" on public.campaigns for select using (true);

drop policy if exists "Authenticated can write campaigns" on public.campaigns;
drop policy if exists "Only admin can write campaigns" on public.campaigns;
create policy "Only admin can write campaigns" on public.campaigns for all
  to authenticated
  using ((auth.jwt() ->> 'email') = 'jake@novasocial.co.uk')
  with check ((auth.jwt() ->> 'email') = 'jake@novasocial.co.uk');

drop policy if exists "Public can read articles" on public.articles;
create policy "Public can read articles" on public.articles for select using (true);

drop policy if exists "Authenticated can write articles" on public.articles;
drop policy if exists "Only admin can write articles" on public.articles;
create policy "Only admin can write articles" on public.articles for all
  to authenticated
  using ((auth.jwt() ->> 'email') = 'jake@novasocial.co.uk')
  with check ((auth.jwt() ->> 'email') = 'jake@novasocial.co.uk');

-- ---------------------------------------------------------------------
-- Storage bucket for campaign card images
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('campaign-images', 'campaign-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can view campaign images" on storage.objects;
create policy "Public can view campaign images" on storage.objects for select
  using (bucket_id = 'campaign-images');

drop policy if exists "Authenticated can manage campaign images" on storage.objects;
drop policy if exists "Only admin can manage campaign images" on storage.objects;
create policy "Only admin can manage campaign images" on storage.objects for all
  to authenticated
  using (bucket_id = 'campaign-images' and (auth.jwt() ->> 'email') = 'jake@novasocial.co.uk')
  with check (bucket_id = 'campaign-images' and (auth.jwt() ->> 'email') = 'jake@novasocial.co.uk');

-- ---------------------------------------------------------------------
-- Seed data — matches what's currently live on the site. Only inserts
-- if the tables are empty, so re-running this won't duplicate rows.
-- ---------------------------------------------------------------------
insert into public.campaigns (sort_order, name, industry, challenge, services, m1_label, m1_value, m2_label, m2_value, image_label)
select * from (values
  (1, 'Harbour Coffee Co.', 'HOSPITALITY', 'Posting often, but with no clear look or message.', 'Brand strategy, content planning, social media management.', 'REACH', '+35%', 'CONSISTENCY', 'Improved', 'CAMPAIGN IMAGE'),
  (2, 'Fieldnote Studio', 'DESIGN', 'Great work, but the story behind it was hard to find online.', 'Visual storytelling, tone of voice, content creation.', 'ENGAGEMENT', '+22%', 'ENQUIRIES', 'Steady', 'CAMPAIGN IMAGE'),
  (3, 'Rowe & Family', 'RETAIL', 'A new shop with no audience and little time to post.', 'Campaign planning, scheduling, monthly reporting.', 'FOLLOWERS', '+1.4k', 'POSTING', '4×/week', 'CAMPAIGN IMAGE')
) as v(sort_order, name, industry, challenge, services, m1_label, m1_value, m2_label, m2_value, image_label)
where not exists (select 1 from public.campaigns);

insert into public.articles (sort_order, category, date_label, title, description, body)
select * from (values
  (1, 'STRATEGY', 'August 2026', 'Why Consistency Matters More Than Going Viral',
   'One popular post is nice. Showing up every week is what builds an audience.',
   E'A viral post feels like progress. It brings a spike in views, a handful of new followers and a good day. Two weeks later, most of that attention is gone.\n\nConsistency works differently. When you post regularly, people start to recognise you. They learn what you do, how you sound and why you are worth following.\n\nStart with a schedule you can actually keep. Two considered posts a week beat seven rushed ones.'),
  (2, 'BRANDING', 'July 2026', 'Is Your Brand Clear Online?',
   'A quick way to check whether people understand what you do in five seconds.',
   E'Most people decide whether to follow you before they read anything properly. They glance at your name, your bio, your first few posts and move on.\n\nOpen your profile as though you have never seen it. Can a stranger tell what you sell, who it is for and where you are based?\n\nClarity is not the same as being plain. You can still be warm and creative. The point is that nobody should have to guess.'),
  (3, 'TECHNOLOGY', 'July 2026', 'How We Use AI In Marketing',
   'Where AI helps us, and where we keep the work firmly human.',
   E'We use AI for the parts of marketing that are slow rather than creative: research, first-pass planning, summarising reports and organising our own workflow.\n\nThat saves hours every week, and those hours go back into strategy, content and time with clients.\n\nWe do not use AI-generated images in client work. Visual content should be authentic to the brand it represents.\n\nTechnology supports the work. People shape the ideas.'),
  (4, 'SOCIAL MEDIA', 'June 2026', 'Social Media Tips For Small Businesses',
   'Simple habits that make a small account feel established.',
   E'A small account can look every bit as considered as a large one. It usually comes down to a few habits rather than budget.\n\nWrite captions like you speak. Reply to comments. Reuse what performed well instead of starting from scratch every time.\n\nThen leave things alone long enough to see whether they work. Most accounts change direction far too quickly.'),
  (5, 'BRANDING', 'June 2026', 'Building A Stronger Brand Online',
   'The pieces worth getting right before you spend on advertising.',
   E'Advertising amplifies whatever is already there. If your message is unclear, paid promotion just puts an unclear message in front of more people.\n\nBefore spending, settle three things: what you want to be known for, how you look and sound, and what you want someone to do when they find you.\n\nOnce those are in place, everything else compounds.')
) as v(sort_order, category, date_label, title, description, body)
where not exists (select 1 from public.articles);
