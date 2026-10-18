import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { workerSource } from "./worker-source.mjs";
const root = new URL("../dist/", import.meta.url);
async function walk(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      files.push(...(await walk(new URL(`${entry.name}/`, dir), `${name}/`)));
    else if (!["sw.js", "release.json"].includes(entry.name)) files.push(name);
  }
  return files;
}
const files = await walk(root);
const hashes = {};
for (const f of files)
  hashes[f] = createHash("sha256")
    .update(await readFile(new URL(f, root)))
    .digest("hex");
const version = createHash("sha256")
  .update(JSON.stringify(hashes))
  .digest("hex")
  .slice(0, 12);
const urls = files.map((f) => `/staff-preview/${f}`);
const worker = workerSource(version, urls);
await writeFile(new URL("sw.js", root), worker);
hashes["sw.js"] = createHash("sha256").update(worker).digest("hex");
await writeFile(
  new URL("release.json", root),
  JSON.stringify(
    {
      version,
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      builtAt: new Date().toISOString(),
      files: hashes,
    },
    null,
    2,
  ),
);
console.log(`Isolated PWA release ${version}: ${files.length} assets`);
