import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Kept separate from the Next build; the `@` alias mirrors tsconfig so tests
// import modules exactly like the app does.
export default defineConfig({
  plugins: [react()],
  // Tests don't need Tailwind; skip loading the Next-style PostCSS config.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    restoreMocks: true,
    clearMocks: true,
  },
});
