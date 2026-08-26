// Shared between the browser bundle (main.js, for building the "Read
// Article" link) and the build-time article page generator
// (scripts/generate-insight-pages.mjs), so both compute the exact same
// URL for a given article title. (public/admin/admin.js keeps its own
// inline copy — that page is deliberately unbundled, see its header.)
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
