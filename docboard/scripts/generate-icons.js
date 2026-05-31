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
  await sharp(buf).resize(512, 512).png().toFile(join(outDir, "docboard-icon-512.png"));
  await sharp(buf).resize(192, 192).png().toFile(join(outDir, "docboard-icon-192.png"));
  await sharp(buf).resize(410, 410, { fit: "contain" }).extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: { r: 248, g: 250, b: 252, alpha: 1 }
  }).png().toFile(join(outDir, "docboard-maskable-512.png"));
  await sharp(buf).resize(154, 154, { fit: "contain" }).extend({
    top: 19,
    bottom: 19,
    left: 19,
    right: 19,
    background: { r: 248, g: 250, b: 252, alpha: 1 }
  }).png().toFile(join(outDir, "docboard-maskable-192.png"));
  await sharp(buf).resize(120, 120).png().toFile(join(outDir, "docboard-apple-touch-icon-120.png"));
  await sharp(buf).resize(152, 152).png().toFile(join(outDir, "docboard-apple-touch-icon-152.png"));
  await sharp(buf).resize(167, 167).png().toFile(join(outDir, "docboard-apple-touch-icon-167.png"));
  await sharp(buf).resize(180, 180).png().toFile(join(outDir, "docboard-apple-touch-icon-180.png"));
  await sharp(buf).resize(180, 180).png().toFile(join(outDir, "apple-touch-icon.png"));
  console.log("Icons generated in", outDir);
}

generate().catch(console.error);
