// Shared between the browser bundle (main.js — building article links) and
// the build-time page generator (scripts/generate-articles.mjs), so both
// compute the exact same URL for a given headline. The admin panel
// (public/admin/admin.js) keeps its own inline copy — that page is
// deliberately unbundled.
export function slugify(text) {
  return (
    String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article"
  );
}
