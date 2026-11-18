import parser from "../../node_modules/markdown-it/dist/browser/markdown-it.esm.min.mjs?raw";
import adminStyles from "../styles/admin.css?raw";
import { isPrivateStudioFile } from "../../scripts/private-studio.mjs";
import { serveStudio } from "./auth/studio.ts";
import type { AdminLocals } from "./auth/http.ts";

// Raw imports stay exclusively in the server bundle, never in public assets.
const files = import.meta.glob<string>(
  [
    "/prototypes/**/*.{html,css,mjs,svg}",
    "!/prototypes/tests/**",
    "/docs/**/*.md",
    "/README.md",
    "/CHANGELOG.md",
  ],
  { query: "?raw", import: "default", eager: true },
);
const sources: Record<string, string | Uint8Array> = {};
for (const [file, contents] of Object.entries(files)) {
  const key = file.slice(1);
  if (isPrivateStudioFile(key)) sources[key] = contents;
}
// Inline bytes are decoded on the server; no private image is emitted to client/.
const images = import.meta.glob<string>("/prototypes/next/assets/*.webp", {
  query: "?inline",
  import: "default",
  eager: true,
});
for (const [file, contents] of Object.entries(images)) {
  const key = file.slice(1);
  if (isPrivateStudioFile(key)) {
    sources[key] = Buffer.from(
      contents.slice(contents.indexOf(",") + 1),
      "base64",
    );
  }
}
sources["prototypes/inventory-products/admin.css"] = adminStyles;
sources["prototypes/vendor/markdown-it.esm.min.mjs"] = parser.replace(
  /\/\/# sourceMappingURL=.*$/gm,
  "",
);
const licenses = import.meta.glob<string>(
  "/node_modules/{markdown-it,argparse,entities,linkify-it,mdurl,punycode.js,uc.micro}/{LICENSE*,license*,COPYING*,copying*}",
  { query: "?raw", import: "default", eager: true },
);
for (const [file, contents] of Object.entries(licenses)) {
  sources[
    `prototypes/vendor/licenses/${file.slice("/node_modules/".length).replaceAll("/", "-")}`
  ] = contents;
}

export function studioResponse(request: Request, locals: AdminLocals) {
  return serveStudio(request, locals, sources);
}
