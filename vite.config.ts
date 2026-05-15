import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const fromRoot = (path: string) => resolve(root, path);

export default defineConfig({
  root: fromRoot("src/renderer"),
  base: "./",
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: fromRoot("dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fromRoot("src/renderer/index.html"),
        pet: fromRoot("src/renderer/pet.html"),
        browser: fromRoot("src/renderer/browser.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@renderer": fromRoot("src/renderer/src"),
      "@shared": fromRoot("src/shared"),
    },
  },
});
