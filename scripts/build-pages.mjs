import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicationFiles, validatePublicationApproval } from "./publication.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");
const markerName = ".true-hive-preview.json";
const generator = "true-hive-pages-preview";
const approval = JSON.parse(await readFile(path.join(root, "publishing.json"), "utf8"));
validatePublicationApproval(approval);
const files = publicationFiles();

for (const file of files) {
  const source = path.join(root, file);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Public source is not a regular file: ${file}`);
}

if (existsSync(output)) {
  if ((await lstat(output)).isSymbolicLink() || !existsSync(path.join(output, markerName))) {
    throw new Error("Refusing to replace an unrecognized dist directory. Inspect it before cleanup.");
  }
  const previous = JSON.parse(await readFile(path.join(output, markerName), "utf8"));
  if (previous.generator !== generator) throw new Error("The existing dist directory is not this preview's generated output.");
  await rm(output, { recursive: true });
}
await mkdir(output);
await writeFile(path.join(output, markerName), JSON.stringify({ generator, status: "building" }, null, 2));

for (const file of files) {
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  if (file === "prototypes/scripts/plan-renderer.mjs") {
    const source = await readFile(path.join(root, file), "utf8");
    const developmentImport = "../../node_modules/markdown-it/dist/browser/markdown-it.esm.min.mjs";
    if (source.split(developmentImport).length !== 2) throw new Error("The planning parser import changed; update the explicit Pages relocation.");
    await writeFile(destination, source.replace(developmentImport, "../vendor/markdown-it.esm.min.mjs"));
  } else {
    await copyFile(path.join(root, file), destination);
  }
}

const vendor = path.join(output, "prototypes/vendor");
await mkdir(path.join(vendor, "licenses"), { recursive: true });
for (const filename of ["markdown-it.esm.min.mjs", "markdown-it.esm.min.mjs.map"]) {
  await copyFile(path.join(root, "node_modules/markdown-it/dist/browser", filename), path.join(vendor, filename));
}
const packages = ["markdown-it", "argparse", "entities", "linkify-it", "mdurl", "punycode.js", "uc.micro"];
const notices = [];
for (const name of packages) {
  const directory = path.join(root, "node_modules", name);
  const licenses = (await readdir(directory)).filter((filename) => /^(?:license|copying)(?:[.-]|$)/i.test(filename));
  if (!licenses.length) throw new Error(`No license notice found for ${name}; refusing an incomplete browser distribution.`);
  for (const filename of licenses) {
    const publishedName = `${name}-${filename}`;
    await copyFile(path.join(directory, filename), path.join(vendor, "licenses", publishedName));
    notices.push(`- ${name}: [${filename}](licenses/${publishedName})`);
  }
}
await writeFile(path.join(vendor, "THIRD-PARTY-NOTICES.md"),
  `# Browser dependency notices\n\nThe locally bundled planning parser and its dependency notices are preserved below.\n\n${notices.join("\n")}\n`);

await writeFile(path.join(output, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=prototypes/">
<title>The True Hive | Public design review</title></head><body>
<h1>The True Hive design and planning preview</h1><p><a href="prototypes/">Open the ten-design gallery</a></p>
<p>Public owner-approved review only. No live orders, payments, reservations or inventory.</p></body></html>\n`);
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, markerName), JSON.stringify({
  generator, status: "ready", repository: approval.repository, scope: approval.scope, sourceFiles: files,
}, null, 2));
console.log(`Built ${files.length} approved source files plus the local parser/notices into dist/.`);
