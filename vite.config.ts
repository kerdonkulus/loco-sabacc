import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths so the app works under GitHub Pages' /loco-sabacc/ path.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  test: { include: ["test/**/*.test.ts"] },
});
