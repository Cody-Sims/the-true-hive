import { readdir, readFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";
import {
  assertCheckedDeployment,
  assertPublicFiles,
} from "./site-artifact-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const client = join(root, "dist-site/client");
const entry = await lstat(join(root, "dist-site/server/entry.mjs"));
const startup = await lstat(join(root, "scripts/start-site.mjs"));
if (!entry.isFile() || !startup.isFile())
  throw new Error(
    "The native Node entrypoint or startup preflight is missing.",
  );
const files = [];
async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error("Public artifacts must not contain symlinks.");
    if (info.isDirectory()) await walk(path);
    else
      files.push({
        path: relative(client, path).split(sep).join("/"),
        contents: await readFile(path, "utf8"),
      });
  }
}
await walk(client);
assertPublicFiles(files);
assertCheckedDeployment(
  parse(await readFile(join(root, "render.yaml"), "utf8")),
  JSON.parse(await readFile(join(root, "package.json"), "utf8")).scripts,
);
console.log(
  `Checked ${files.length} public assets, native server entrypoint, and CI-gated deployment policy.`,
);
