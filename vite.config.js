import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// Multi-page build: nine static HTML entries (see rollupOptions.input below),
// each pulling shared header/footer/modal markup from src/partials/ via the
// htmlPartials plugin. Deployed here on the `dev` branch to Vercel.

const partialsDir = fileURLToPath(new URL("./src/partials/", import.meta.url));

// Expands `<!--@include name-->` comments with the contents of
// src/partials/name.html, so header/footer/modal markup lives in one place
// instead of being duplicated across every page. Runs before Vite's own
// HTML asset scanning (order: "pre") so <script>/<link> tags inside the
// included partials would still be picked up if any existed.
function htmlPartials() {
  const includeRe = /<!--\s*@include\s+([\w-]+)\s*-->/g;
  return {
    name: "nova-html-partials",
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
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        services: fileURLToPath(new URL("./services.html", import.meta.url)),
        marketing: fileURLToPath(new URL("./marketing.html", import.meta.url)),
        branding: fileURLToPath(new URL("./branding.html", import.meta.url)),
        socialMedia: fileURLToPath(new URL("./social-media.html", import.meta.url)),
        work: fileURLToPath(new URL("./work.html", import.meta.url)),
        insights: fileURLToPath(new URL("./insights.html", import.meta.url)),
        about: fileURLToPath(new URL("./about.html", import.meta.url)),
        contact: fileURLToPath(new URL("./contact.html", import.meta.url))
      }
    }
  }
});
