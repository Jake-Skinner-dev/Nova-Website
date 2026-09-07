import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// Nova Brief — its own multi-page static build, fully independent of the
// parent Nova Social site. Same build approach the parent uses (see the
// repo-root vite.config.js): a tiny HTML-partials plugin so the masthead /
// footer / CTA markup lives in one place, and a list of real page entries
// so each gets its own URL and its own <head> for SEO.

const partialsDir = fileURLToPath(new URL("./src/partials/", import.meta.url));

// Expands `<!--@include name-->` with src/partials/name.html. Ported
// verbatim from the parent site's config so both builds behave identically.
function htmlPartials() {
  const includeRe = /<!--\s*@include\s+([\w-]+)\s*-->/g;
  return {
    name: "nova-brief-html-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(includeRe, (_match, name) =>
          readFileSync(`${partialsDir}${name}.html`, "utf-8")
        );
      }
    }
  };
}

const page = (name) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [htmlPartials()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    cssMinify: true,
    rollupOptions: {
      input: {
        index: page("index"),
        about: page("about"),
        newsletter: page("newsletter"),
        search: page("search"),
        article: page("article"),
        notFound: page("404"),
        // Section landings — the editorial "franchises". The article
        // generator overwrites each of these dist/ files with a static,
        // fully-populated version at build time; the source file here is
        // the dev-mode (client-rendered) shell.
        news: page("news"),
        campaigns: page("campaigns"),
        social: page("social"),
        brand: page("brand"),
        digital: page("digital"),
        ai: page("ai"),
        advertising: page("advertising"),
        agencies: page("agencies"),
        stats: page("stats")
      }
    }
  }
});
