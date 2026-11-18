import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicationApproval } from "./publication.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");
const markerName = ".true-hive-preview.json";
const generator = "true-hive-pages-preview";
const approval = JSON.parse(await readFile(path.join(root, "publishing.json"), "utf8"));
validatePublicationApproval(approval);

if (existsSync(output)) {
  if ((await lstat(output)).isSymbolicLink() || !existsSync(path.join(output, markerName))) {
    throw new Error("Refusing to replace an unrecognized dist directory. Inspect it before cleanup.");
  }
  const previous = JSON.parse(await readFile(path.join(output, markerName), "utf8"));
  if (previous.generator !== generator) throw new Error("The existing dist directory is not this preview's generated output.");
  await rm(output, { recursive: true });
}
await mkdir(output);
const redirect = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${approval.destination}">
<title>The True Hive | Administrator studio</title></head><body>
<h1>The studio has moved</h1><p>Administrator sign-in is required.</p>
<p><a href="${approval.destination}">Open the private studio</a></p></body></html>\n`;
for (const filename of ["index.html", "404.html"]) await writeFile(path.join(output, filename), redirect);
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, markerName), JSON.stringify({
  generator, status: "ready", scope: approval.scope, sourceFiles: [],
}, null, 2));
console.log("Built redirect-only Pages artifact. No planning or prototype source is published.");
