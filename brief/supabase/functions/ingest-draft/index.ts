// Nova Brief — AI draft ingestion endpoint (Supabase Edge Function).
//
// This is the ONLY sanctioned way for an automated system to put a draft
// into Nova Brief. It always creates one brief_articles row with
// source = 'ai' and status = 'draft'. The database trigger
// brief_ai_publish_guard is a second line of defence: even a bug here
// cannot publish anything.
//
// Deploy:
//   supabase functions deploy ingest-draft
//   supabase secrets set INGEST_TOKEN=<long random string>
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key>
//   (SUPABASE_URL is provided by the platform)
//
// See brief/API.md for the request/response contract.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_TOKEN = Deno.env.get("INGEST_TOKEN")!;
const SITE = "https://brief.novasocial.co.uk";

const CONTENT_TYPES = [
  "News", "Campaign", "Analysis", "Opinion", "Killer Stat",
  "Weekly Brief", "Campaign Breakdown", "Nova Take", "Sponsored"
];

function slugify(text: string): string {
  return (
    String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article"
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${INGEST_TOKEN}`) return json({ error: "unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const headline = String(payload.headline || "").trim();
  if (!headline) return json({ error: "headline is required" }, 422);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false }
  });

  // Dedupe the slug.
  let slug = slugify(headline);
  const { data: clash } = await supabase
    .from("brief_articles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const contentType = CONTENT_TYPES.includes(String(payload.suggested_content_type))
    ? String(payload.suggested_content_type)
    : "News";

  const row = {
    source: "ai",
    status: "draft", // trigger enforces this regardless
    headline,
    slug,
    standfirst: String(payload.standfirst || "").trim(),
    body: String(payload.body || "").trim(),
    category: String(payload.suggested_category || "News").trim() || "News",
    content_type: contentType,
    author: "Nova Brief",
    tags: Array.isArray(payload.tags) ? payload.tags.map(String).slice(0, 20) : [],
    brand: payload.brand ? String(payload.brand).trim() : null,
    source_name: payload.source_name ? String(payload.source_name).trim() : null,
    source_url: payload.source_url ? String(payload.source_url).trim() : null,
    featured_image_url: payload.featured_image_url ? String(payload.featured_image_url).trim() : null,
    seo_title: payload.seo_title ? String(payload.seo_title).trim() : null,
    meta_description: payload.meta_description ? String(payload.meta_description).trim() : null,
    ai_score: typeof payload.ai_score === "number" ? payload.ai_score : null,
    ai_sources: payload.ai_sources ?? null,
    ai_model: payload.ai_model ? String(payload.ai_model) : null,
    ai_notes: payload.ai_notes ? String(payload.ai_notes) : null
  };

  const { data, error } = await supabase
    .from("brief_articles")
    .insert(row)
    .select("id, slug, status")
    .single();

  if (error) return json({ error: error.message }, 500);

  return json(
    {
      id: data.id,
      slug: data.slug,
      status: data.status, // always "draft"
      review_url: `${SITE}/admin/#articles`
    },
    201
  );
});
