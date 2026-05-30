#!/usr/bin/env node
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function generate() {
  const sharp = require("sharp");
  const svgPath = join(__dirname, "../public/icons/docboardlogo.svg");
  const svg = await fs.readFile(svgPath, "utf-8");

  const buf = Buffer.from(svg);
  const outDir = join(__dirname, "../public/icons");

  await sharp(buf).resize(512, 512).png().toFile(join(outDir, "icon-512.png"));
  await sharp(buf).resize(192, 192).png().toFile(join(outDir, "icon-192.png"));
  console.log("Icons generated in", outDir);
}

generate().catch(console.error);
