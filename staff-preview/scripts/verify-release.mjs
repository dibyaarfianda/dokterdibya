import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
const dir = resolve(process.argv[2] || "dist");
const commit = process.argv[3];
const release = JSON.parse(
  await readFile(resolve(dir, "release.json"), "utf8"),
);
if (commit && release.commit !== commit)
  throw new Error("Release commit does not match the requested commit");
for (const [file, expected] of Object.entries(release.files)) {
  const path = resolve(dir, file);
  if (!path.startsWith(dir + sep)) throw new Error("Invalid release path");
  const actual = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (actual !== expected) throw new Error(`Asset mismatch: ${file}`);
}
const manifest = JSON.parse(
  await readFile(resolve(dir, "manifest.webmanifest"), "utf8"),
);
if (manifest.scope !== "/staff-preview/" || manifest.id !== "/staff-preview/")
  throw new Error("Unexpected PWA scope");
console.log(
  `Verified preview ${release.version}, commit ${release.commit}, ${Object.keys(release.files).length} assets`,
);
