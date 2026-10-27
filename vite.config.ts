import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths so the app works from any path, not just the site root.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  test: { include: ["test/**/*.test.ts"] },
});
