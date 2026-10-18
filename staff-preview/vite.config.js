import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { execFileSync } from "node:child_process";
let commit = "development";
try {
  commit = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {
  /* Source archives can be built without a Git checkout. */
}
export default defineConfig({
  plugins: [preact()],
  base: "/staff-preview/",
  define: {
    __PREVIEW_VERSION__: JSON.stringify(
      process.env.PREVIEW_VERSION || `preview-${commit}`,
    ),
  },
  build: { sourcemap: false },
  server: { host: "127.0.0.1", port: 4175 },
  preview: { host: "127.0.0.1", port: 4175 },
});
