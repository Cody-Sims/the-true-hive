import { readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";

export function assertRedirectArtifact(directory) {
  const files = readdirSync(directory).sort();
  const expected = [".nojekyll", ".true-hive-preview.json", "404.html", "index.html"].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error("Private or unexpected files in Pages redirect artifact.");
  for (const file of files) {
    if (!lstatSync(path.join(directory, file)).isFile()) throw new Error("Pages redirect artifacts must be regular files.");
  }
  for (const file of ["index.html", "404.html"]) {
    const body = readFileSync(path.join(directory, file), "utf8");
    if (!body.includes('content="0;url=https://thetruehive.com/prototypes/"') ||
        !body.includes('href="https://thetruehive.com/prototypes/"') ||
        /<script|<iframe|<img|<link|\bsrc\s*=/i.test(body)) {
      throw new Error("Pages must contain only a static canonical redirect.");
    }
  }
  const marker = JSON.parse(readFileSync(path.join(directory, ".true-hive-preview.json"), "utf8"));
  if (marker.scope !== "redirect-only" || marker.sourceFiles?.length !== 0)
    throw new Error("Private sources cannot appear in the Pages manifest.");
}
