import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const target = new URL("../public/brand/", import.meta.url);
await mkdir(target, { recursive: true });
const source = new URL(
  "../../staff/public/images/laboratorium/",
  import.meta.url,
);
for (const file of ["dpc-lab-logo.png", "sw-healthcare.png", "melinda.png"])
  await copyFile(new URL(file, source), new URL(file, target));
for (const size of [192, 512])
  await copyFile(
    new URL(
      `../../staff/public/icons/icon-maskable-${size}x${size}.png`,
      import.meta.url,
    ),
    new URL(`icon-${size}.png`, target),
  );
console.log(`Brand assets prepared: ${fileURLToPath(target)}`);
